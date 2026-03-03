from fastapi import FastAPI, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
import pandas as pd
import requests
import io
import os
from sqlalchemy.orm import Session
from .database import SessionLocal, engine
from .models import Chat, Message, Base

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
async def ask_question(query: str = Form(...)):
    try:
        if "data" not in excel_data_store:
            return {"error": "No file uploaded yet!"}

        context = excel_data_store["data"]

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return {"error": "GROQ_API_KEY not set"}

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

        api_url = os.getenv("API_URL")
        resp = requests.post(api_url, headers=headers, json=payload)

        if resp.status_code != 200:
            return {"error": f"API error: {resp.status_code} {resp.text}"}

        resp_json = resp.json()
        answer = resp_json["choices"][0]["message"]["content"]

        # =========================
        # 🔥 NEW: STORE IN DATABASE
        # =========================

        db: Session = SessionLocal()

        # Create new chat for now (no user system yet)
        new_chat = Chat(title="Excel Chat")
        db.add(new_chat)
        db.commit()
        db.refresh(new_chat)

        # Store user message
        user_message = Message(
            chat_id=new_chat.id,
            role="user",
            content=query
        )
        db.add(user_message)

        # Store bot message
        bot_message = Message(
            chat_id=new_chat.id,
            role="bot",
            content=answer
        )
        db.add(bot_message)

        db.commit()
        db.close()

        return {
            "chat_id": str(new_chat.id),
            "answer": answer
        }

    except Exception as e:
        return {"error": str(e)}