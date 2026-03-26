document.addEventListener("DOMContentLoaded", () => {

  const sendBtn = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  const chatMessages = document.getElementById("chatMessages");
  const chatList = document.getElementById("chatList");
  const newChatBtn = document.getElementById("newChatBtn");
  const fileUpload = document.getElementById("fileUpload");
  const uploadBtn = document.getElementById("uploadBtn");
  const spinner = document.getElementById("spinner");
  const toastContainer = document.getElementById("toast-container");
  const fileInfo = document.getElementById("fileInfo");
  const themeBtn = document.getElementById("themeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const voiceBtn = document.getElementById("voiceBtn");

  let currentChatId = null;

  /* ============================= */
  /* Utility */
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
  /* Upload */
  /* ============================= */

  uploadBtn.addEventListener("click", () => fileUpload.click());

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
  /* Sidebar - Load Chats */
  /* ============================= */

  async function loadChats() {
    try {
      const response = await fetch("/chats/");
      const chats = await response.json();

      chatList.innerHTML = "";

      chats.forEach(chat => {

        const div = document.createElement("div");
        div.className = "chat-item";

        // highlight active
        if (chat.id === currentChatId) {
          div.classList.add("active-chat");
        }

        // title
        const title = document.createElement("span");
        title.textContent = chat.title;

        // menu button
        const menuBtn = document.createElement("span");
        menuBtn.textContent = "⋮";
        menuBtn.className = "menu-btn";

        div.appendChild(title);
        div.appendChild(menuBtn);

        // click chat
        div.addEventListener("click", (e) => {
          if (e.target !== menuBtn) {
            loadChatMessages(chat.id);
          }
        });

        // menu click
        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showMenu(menuBtn, chat);
        });

        chatList.appendChild(div);
      });

    } catch {
      showToast("Failed to load chats", "error");
    }
  }

  /* ============================= */
  /* Load Messages */
  /* ============================= */

  async function loadChatMessages(chatId) {
    try {
      const response = await fetch(`/chats/${chatId}`);
      const messages = await response.json();

      chatMessages.innerHTML = "";
      currentChatId = chatId;

      messages.forEach(msg => {
        appendMessage(msg.content, msg.role);
      });

      loadChats(); // refresh highlight

    } catch {
      showToast("Failed to load messages", "error");
    }
  }

  /* ============================= */
  /* Context Menu */
  /* ============================= */

  function showMenu(button, chat) {

    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "context-menu";

    const rename = document.createElement("div");
    rename.textContent = "Rename";

    const del = document.createElement("div");
    del.textContent = "Delete";

    menu.appendChild(rename);
    menu.appendChild(del);
    document.body.appendChild(menu);

    const rect = button.getBoundingClientRect();
    menu.style.top = rect.bottom + "px";
    menu.style.left = rect.left + "px";

    // Rename
    rename.onclick = async () => {
      const newTitle = prompt("Enter new name:");
      if (!newTitle) return;

      await fetch(`/chats/${chat.id}`, {
        method: "PUT",
        body: new URLSearchParams({ title: newTitle })
      });

      loadChats();
      menu.remove();
    };

    // Delete
    del.onclick = async () => {
      const confirmDelete = confirm("Delete this chat?");
      if (!confirmDelete) return;

      await fetch(`/chats/${chat.id}`, {
        method: "DELETE"
      });

      if (currentChatId === chat.id) {
        currentChatId = null;
        chatMessages.innerHTML = "";
      }

      loadChats();
      menu.remove();
    };

    document.addEventListener("click", () => {
      menu.remove();
    }, { once: true });
  }

  /* ============================= */
  /* New Chat */
  /* ============================= */

  newChatBtn.addEventListener("click", () => {
    currentChatId = null;
    chatMessages.innerHTML = "";
    loadChats();
    showToast("New chat started", "success");
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

    if (currentChatId) {
      formData.append("chat_id", currentChatId);
    }

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

        if (!currentChatId && result.chat_id) {
          currentChatId = result.chat_id;
          loadChats();
        }
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
  /* Theme */
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

  const savedTheme = localStorage.getItem("theme");
  setTheme(savedTheme === "dark");

  themeBtn.addEventListener("click", () => {
    themeIcon.classList.add("rotate");

    setTimeout(() => {
      const isDark = document.body.classList.contains("dark");
      setTheme(!isDark);
      themeIcon.classList.remove("rotate");
    }, 200);
  });

  /* ============================= */
  /* Voice */
  /* ============================= */

  if ('webkitSpeechRecognition' in window) {
    const recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";

    voiceBtn.addEventListener("click", () => recognition.start());

    recognition.onresult = (event) => {
      messageInput.value = event.results[0][0].transcript;
    };
  }

  /* ============================= */
  /* INIT */
  /* ============================= */

  loadChats();

});