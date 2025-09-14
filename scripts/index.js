document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".chat-header");
  const text = "Upload any Excel or CSV and ask your query related to it in natural language!";
  let index = 0;

  // Typewriter effect
  function typeEffect() {
    if (index < text.length) {
      header.textContent += text.charAt(index);
      index++;
      setTimeout(typeEffect, 50); // typing speed
    } else {
      setTimeout(() => {
        header.textContent = "";
        index = 0;
        typeEffect();
      }, 3000); // restart after delay
    }
  }

  header.textContent = "";
  typeEffect();

  // Chat elements
  const sendBtn = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  const chatMessages = document.getElementById("chatMessages");
  const fileUpload = document.getElementById("fileUpload");

  // Function to append message
  function appendMessage(message, sender) {
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("chat-message", sender === "user" ? "user-message" : "bot-message");
    msgDiv.textContent = message;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Upload file to backend
  fileUpload.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      appendMessage("Uploading file: " + file.name, "user");

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("http://127.0.0.1:8000/upload_excel/", {
          method: "POST",
          body: formData
        });

        const result = await response.json();
        if (result.error) {
          appendMessage("❌ Error: " + result.error, "bot");
        } else {
          appendMessage(`✅ File uploaded (${result.rows} rows, columns: ${result.columns.join(", ")})`, "bot");
        }
      } catch (err) {
        appendMessage("❌ Upload failed", "bot");
      }
    }
  });

  // Handle send button (query to backend)
  sendBtn.addEventListener("click", async () => {
    const message = messageInput.value.trim();
    if (message) {
      appendMessage(message, "user");
      messageInput.value = "";

      try {
        const formData = new FormData();
        formData.append("query", message);

        const response = await fetch("http://127.0.0.1:8000/ask/", {
          method: "POST",
          body: formData
        });

        const result = await response.json();
        if (result.error) {
          appendMessage("❌ Error: " + result.error, "bot");
        } else {
          appendMessage(result.answer, "bot");
        }
      } catch (err) {
        appendMessage("❌ Query failed", "bot");
      }
    }
  });

  // Handle Enter key
  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendBtn.click();
    }
  });
});
