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

excel_data_store = {}

@app.get("/")
async def home():
    file_path = os.path.join("templates", "index.html")
    return FileResponse(file_path)

@app.post("/upload_excel/")
async def upload_excel(file: UploadFile = File(...)):
    try:
        content = await file.read()
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))

        text_data = df.to_string(index=False)

        excel_data_store["data"] = text_data

        return {"message": "File uploaded successfully", "rows": len(df), "columns": list(df.columns)}

    except Exception as e:
        return {"error": str(e)}


@app.post("/ask/")
def ask_question(query: str = Form(...), chat_id: str = Form(None)):
    db: Session = SessionLocal()

    try:
        # =========================
        # VALIDATE DATA
        # =========================
        if "data" not in excel_data_store:
            return {"error": "No file uploaded yet!"}

        context = excel_data_store["data"]

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return {"error": "GROQ_API_KEY not set"}

        api_url = os.getenv("API_URL")

        # =========================
        # CALL LLM API
        # =========================
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
        # CHAT CONTINUATION LOGIC
        # =========================

        if chat_id:
            chat = db.query(Chat).filter(Chat.id == chat_id).first()

            if not chat:
                return {"error": "Invalid chat_id"}

        else:
            # Create new chat with dynamic title
            chat = Chat(title=generate_title(query))            
            db.add(chat)
            db.commit()
            db.refresh(chat)

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
# HELPER FUNCTION TO GENERATE CHAT TITLES
# =========================  
        
def generate_title(query: str):
    q = query.strip().capitalize()
    if len(q) > 40:
        q = q[:40] + "..."
    return q