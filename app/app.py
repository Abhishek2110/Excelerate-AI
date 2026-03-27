from fastapi import FastAPI, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
import pandas as pd
import requests
import io
import os

from sqlalchemy.orm import Session
from .database import SessionLocal
from .models import Chat, Message

load_dotenv()

app = FastAPI()

app.mount("/styles", StaticFiles(directory="styles"), name="styles")
app.mount("/scripts", StaticFiles(directory="scripts"), name="scripts")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Temporary store
excel_data_store = {}

# =========================
# HOME
# =========================
@app.get("/")
async def home():
    file_path = os.path.join("templates", "index.html")
    return FileResponse(file_path)


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
def ask_question(query: str = Form(...), chat_id: str = Form(None)):
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

            chat = Chat(
                title=generate_title(query),
                file_data=file_bytes,
                file_name=file_name
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

        # ✅ Limit context (VERY IMPORTANT)
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
            "chat_id": str(chat.id),
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
def get_chats():
    db = SessionLocal()
    try:
        chats = db.query(Chat).order_by(Chat.created_at.desc()).all()

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
def get_messages(chat_id: str):
    db = SessionLocal()
    try:
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
def rename_chat(chat_id: str, title: str = Form(...)):
    db = SessionLocal()
    try:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()

        if not chat:
            return {"error": "Chat not found"}

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


# =========================
# HELPER FUNCTION
# =========================
def generate_title(query: str):
    q = query.strip().capitalize()
    if len(q) > 40:
        q = q[:40] + "..."
    return q