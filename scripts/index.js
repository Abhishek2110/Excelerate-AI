document.addEventListener("DOMContentLoaded", () => {

  const sendBtn = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  const chatMessages = document.getElementById("chatMessages");
  const fileUpload = document.getElementById("fileUpload");
  const uploadBtn = document.getElementById("uploadBtn");
  const spinner = document.getElementById("spinner");
  const toastContainer = document.getElementById("toast-container");
  const fileInfo = document.getElementById("fileInfo");
  const themeBtn = document.getElementById("themeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const voiceBtn = document.getElementById("voiceBtn");

  /* ============================= */
  /* Utility Functions */
  /* ============================= */

  function showSpinner(show) {
    spinner.style.display = show ? "block" : "none";
  }

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function appendMessage(message, sender) {
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("chat-message", sender);

    const avatar = document.createElement("img");
    avatar.classList.add("avatar");
    avatar.src = sender === "user"
      ? "https://cdn-icons-png.flaticon.com/512/149/149071.png"
      : "https://cdn-icons-png.flaticon.com/512/4712/4712109.png";

    const bubble = document.createElement("div");
    bubble.classList.add("message-bubble");
    bubble.textContent = message;

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    chatMessages.appendChild(msgDiv);

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /* ============================= */
  /* Upload Button Trigger */
  /* ============================= */

  uploadBtn.addEventListener("click", () => {
    fileUpload.click();
  });

  /* ============================= */
  /* File Upload */
  /* ============================= */

  fileUpload.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileInfo.innerHTML = `📄 ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
    showSpinner(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/upload_excel/", {
        method: "POST",
        body: formData
      });

      const result = await response.json();
      showSpinner(false);

      if (result.error) {
        showToast(result.error, "error");
      } else {
        showToast("File uploaded successfully!", "success");
      }

    } catch {
      showSpinner(false);
      showToast("Upload failed", "error");
    }
  });

  /* ============================= */
  /* Send Message */
  /* ============================= */

  sendBtn.addEventListener("click", async () => {
    const message = messageInput.value.trim();
    if (!message) return;

    appendMessage(message, "user");
    messageInput.value = "";
    showSpinner(true);

    const formData = new FormData();
    formData.append("query", message);

    try {
      const response = await fetch("/ask/", {
        method: "POST",
        body: formData
      });

      const result = await response.json();
      showSpinner(false);

      if (result.error) {
        showToast(result.error, "error");
      } else {
        appendMessage(result.answer, "bot");
      }

    } catch {
      showSpinner(false);
      showToast("Query failed", "error");
    }
  });

  messageInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendBtn.click();
  });

  /* ============================= */
  /* Dark Mode (Smooth Icon Morph) */
  /* ============================= */

  function setTheme(isDark) {
    if (isDark) {
      document.body.classList.add("dark");
      themeIcon.textContent = "☀️";
      localStorage.setItem("theme", "dark");
    } else {
      document.body.classList.remove("dark");
      themeIcon.textContent = "🌙";
      localStorage.setItem("theme", "light");
    }
  }

  // Load saved theme
  const savedTheme = localStorage.getItem("theme");
  setTheme(savedTheme === "dark");

  // Smooth transform animation
  themeBtn.addEventListener("click", () => {

    themeIcon.classList.add("rotate");

    setTimeout(() => {
      const isDark = document.body.classList.contains("dark");
      setTheme(!isDark);
      themeIcon.classList.remove("rotate");
    }, 200);

  });

  /* ============================= */
  /* Voice Input */
  /* ============================= */

  if ('webkitSpeechRecognition' in window) {
    const recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";

    voiceBtn.addEventListener("click", () => recognition.start());

    recognition.onresult = (event) => {
      messageInput.value = event.results[0][0].transcript;
    };
  }

});