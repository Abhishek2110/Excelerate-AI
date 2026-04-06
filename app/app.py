from fastapi import FastAPI, File, UploadFile, Form, Depends, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from dotenv import load_dotenv
import pandas as pd
import requests
import io
import os

from .auth import hash_password, create_access_token, verify_password, decode_token

from sqlalchemy.orm import Session
from .database import SessionLocal, engine
from .models import Chat, Message, User, Base
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request
from .oauth import oauth

Base.metadata.create_all(bind=engine)

load_dotenv()

app = FastAPI()

app.add_middleware(SessionMiddleware, secret_key=os.getenv("SECRET_KEY"))

app.mount("/styles", StaticFiles(directory="styles"), name="styles")
app.mount("/scripts", StaticFiles(directory="scripts"), name="scripts")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Temporary store
excel_data_store = {}

# =========================
# HELPER FUNCTIONS
# =========================
def generate_title(query: str):
    q = query.strip().capitalize()
    if len(q) > 40:
        q = q[:40] + "..."
    return q

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing token")

    try:
        token = authorization.split(" ")[1]
        payload = decode_token(token)
        user_id = payload.get("user_id")

        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return user

    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")
    
def get_optional_user(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization:
        return None

    try:
        token = authorization.split(" ")[1]
        payload = decode_token(token)
        user_id = payload.get("user_id")

        return db.query(User).filter(User.id == user_id).first()

    except:
        return None
    
# =========================
# HOME
# =========================
@app.get("/")
async def home():
    file_path = os.path.join("templates", "index.html")
    return FileResponse(file_path)

@app.get("/login")
async def login_page():
    return FileResponse(os.path.join("templates", "login.html"))

@app.get("/signup")
async def signup_page():
    return FileResponse(os.path.join("templates", "signup.html"))

@app.get("/auth/google")
async def google_login(request: Request):
    redirect_uri = request.url_for('google_callback')
    return await oauth.google.authorize_redirect(request, redirect_uri)

@app.get("/auth/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get('userinfo')

    if not user_info:
        raise HTTPException(status_code=400, detail="Failed to fetch user info from Google")

    email = user_info['email']
    name = user_info.get('name', '')

    # Check if user exists, else create
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            name=name,
            hashed_password=None,
            auth_provider="google"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Create JWT token (reuse your existing function)
    access_token = create_access_token(data={"user_id": str(user.id)})

    # Redirect to frontend with token
    frontend_url = "/"
    return RedirectResponse(url=f"{frontend_url}?token={access_token}")

# =========================
# UPLOAD EXCEL
# =========================
@app.post("/upload_excel/")
async def upload_excel(file: UploadFile = File(...)):
    try:
        content = await file.read()

        # ✅ Validate file type
        if not file.filename.endswith((".csv", ".xls", ".xlsx")):
            return {"error": "Only CSV and Excel files allowed"}

        # ✅ Validate size (5MB)
        if len(content) > 5 * 1024 * 1024:
            return {"error": "File too large (max 5MB)"}

        # Parse preview
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))

        # Store temporarily
        excel_data_store["file_data"] = content
        excel_data_store["file_name"] = file.filename

        return {
            "message": "File uploaded successfully",
            "rows": len(df),
            "columns": list(df.columns)
        }

    except Exception as e:
        return {"error": str(e)}


# =========================
# ASK QUESTION
# =========================
@app.post("/ask/")
def ask_question(
    query: str = Form(...),
    chat_id: str = Form(None),
    current_user: User = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    db: Session = SessionLocal()

    try:
        # =========================
        # LOAD DATA
        # =========================

        if chat_id:
            chat = db.query(Chat).filter(Chat.id == chat_id).first()

            if not chat:
                return {"error": "Invalid chat_id"}

            file_bytes = chat.file_data

            if not file_bytes:
                return {"error": "No file associated with this chat"}

            file_name = chat.file_name

        else:
            # New chat
            if "file_data" not in excel_data_store:
                return {"error": "No file uploaded yet!"}

            file_bytes = excel_data_store["file_data"]
            file_name = excel_data_store["file_name"]

            chat = None
            if current_user:
                chat = Chat(
                    title=generate_title(query),
                    file_data=file_bytes,
                    file_name=file_name,
                    user_id=current_user.id
                )
                db.add(chat)
                db.commit()
                db.refresh(chat)

                # Clear temp store after use
                excel_data_store.clear()

        # =========================
        # PARSE FILE
        # =========================

        if file_name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            df = pd.read_excel(io.BytesIO(file_bytes))

        context = df.to_string(index=False)

        # =========================
        # CALL LLM API
        # =========================

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return {"error": "GROQ_API_KEY not set"}

        api_url = os.getenv("API_URL")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": os.getenv("MODEL_NAME"),
            "messages": [
                {
                    "role": "system",
                    "content": "You are a data assistant. Answer questions correctly based on the uploaded Excel/CSV content."
                },
                {
                    "role": "user",
                    "content": f"Data:\n{context}\n\nQuestion: {query}"
                }
            ]
        }

        resp = requests.post(api_url, headers=headers, json=payload)

        if resp.status_code != 200:
            return {"error": f"API error: {resp.status_code} {resp.text}"}

        resp_json = resp.json()
        answer = resp_json["choices"][0]["message"]["content"]

        # =========================
        # STORE MESSAGES
        # =========================

        if chat:
            user_message = Message(
                chat_id=chat.id,
                role="user",
                content=query
            )
            db.add(user_message)

            bot_message = Message(
                chat_id=chat.id,
                role="bot",
                content=answer
            )
            db.add(bot_message)

            db.commit()

        return {
            "chat_id": str(chat.id) if chat else None,
            "answer": answer
        }

    except Exception as e:
        return {"error": str(e)}

    finally:
        db.close()


# =========================
# GET ALL CHATS
# =========================
@app.get("/chats/")
def get_chats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        chats = db.query(Chat)\
            .filter(Chat.user_id == current_user.id)\
            .order_by(Chat.created_at.desc())\
            .all()

        return [
            {
                "id": str(chat.id),
                "title": chat.title,
                "file_name": chat.file_name
            }
            for chat in chats                                                                                                                                                                                                                                   
        ]
    finally:
        db.close()
        
# =========================
# GET CHAT MESSAGES
# =========================
@app.get("/chats/{chat_id}")
def get_messages(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()

        if not chat:
            return {"error": "Chat not found"}

        if chat.user_id != current_user.id:
            return {"error": "Unauthorized"}

        messages = db.query(Message)\
            .filter(Message.chat_id == chat_id)\
            .order_by(Message.created_at)\
            .all()

        return [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]
    finally:
        db.close()


# =========================
# RENAME CHAT
# =========================
@app.put("/chats/{chat_id}")
def rename_chat(
    chat_id: str,
    title: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()

        if not chat:
            return {"error": "Chat not found"}

        # 🔥 SECURITY CHECK
        if chat.user_id != current_user.id:
            return {"error": "Unauthorized"}

        chat.title = title
        db.commit()

        return {"message": "Chat renamed successfully"}
    finally:
        db.close()


# =========================
# DELETE CHAT
# =========================
@app.delete("/chats/{chat_id}")
def delete_chat(chat_id: str):
    db = SessionLocal()
    try:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()

        if not chat:
            return {"error": "Chat not found"}

        db.query(Message).filter(Message.chat_id == chat_id).delete()
        db.delete(chat)
        db.commit()

        return {"message": "Chat deleted successfully"}

    finally:
        db.close()

@app.post("/signup/")
def signup(email: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return {"error": "User already exists"}

    user = User(
        email=email,
        hashed_password=hash_password(password)
    )

    db.add(user)
    db.commit()

    return {"message": "User created successfully"}

@app.post("/login/")
def login(email: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.auth_provider == "google":
        raise HTTPException(status_code=400, detail="Please sign in with Google")
    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access_token = create_access_token(data={"user_id": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}