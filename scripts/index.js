document.addEventListener("DOMContentLoaded", () => {

  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) {
    localStorage.setItem("token", urlToken);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const token = localStorage.getItem("token");
  const isLoggedIn = !!token;

  const sendBtn = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  const chatMessages = document.getElementById("chatMessages");
  const chatList = document.getElementById("chatList");
  const newChatBtn = document.getElementById("newChatBtn");
  const fileUpload = document.getElementById("fileUpload");
  const uploadBtn = document.getElementById("uploadBtn");
  const spinner = document.getElementById("spinner");
  const toastContainer = document.getElementById("toast-container");
  const themeBtn = document.getElementById("themeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const voiceBtn = document.getElementById("voiceBtn");
  const datasetBar = document.getElementById("currentDataset");
  const authBanner = document.getElementById("authBanner");

  let currentChatId = null;

  /* ============================= */
  /* AUTH BANNER */
  /* ============================= */

  function renderAuthBanner() {
    if (!authBanner) return;

    if (!isLoggedIn) {
      authBanner.innerHTML = `
        ⚠️ This is a temporary chat. Your chats will not be saved.
        <button id="loginRedirectBtn">Login</button>
      `;

      document.getElementById("loginRedirectBtn").onclick = () => {
        window.location.href = "/login";
      };

    } else {
      authBanner.innerHTML = `
        ✅ Logged in
        <button id="logoutBtn">Logout</button>
      `;

      document.getElementById("logoutBtn").onclick = () => {
        localStorage.removeItem("token");
        location.reload();
      };
    }
  }

  renderAuthBanner();

  /* ============================= */
  /* Utility */
  /* ============================= */

  function showSpinner(show) {
    spinner.style.display = show ? "block" : "none";
  }

  function validateQuery(query) {
    if (!query) return "Message cannot be empty";
    if (query.length < 2) return "Message too short";
    if (query.length > 500) return "Message too long";
    return null;
  }

    function validateTitle(query) {
    if (!query) return "Title cannot be empty";
    if (query.length < 2) return "Title too short";
    if (query.length > 500) return "Title too long";
    return null;
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

  function updateDatasetUI(fileName, fileSize = null) {
    if (!fileName) {
      datasetBar.textContent = "📄 No dataset selected";
    } else {
      datasetBar.textContent = fileSize
        ? `📄 ${fileName} (${fileSize})`
        : `📄 ${fileName}`;
    }
  }

  function getAuthHeader() {
    return token ? { "Authorization": "Bearer " + token } : {};
  }

  /* ============================= */
  /* Upload */
  /* ============================= */

  uploadBtn.addEventListener("click", () => fileUpload.click());

  fileUpload.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    currentChatId = null;
    chatMessages.innerHTML = "";

    appendMessage("📊 New dataset loaded. Ask your questions!", "bot");

    const sizeKB = (file.size / 1024).toFixed(2) + " KB";
    updateDatasetUI(file.name, sizeKB);

    showSpinner(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/upload_excel/", {
        method: "POST",
        headers: getAuthHeader(),
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
  /* Sidebar */
  /* ============================= */

  async function loadChats() {
    if (!isLoggedIn) {
      chatList.innerHTML = `<div style="opacity:0.6;">Login to see saved chats</div>`;
      return;
    }

    try {
      const response = await fetch("/chats/", {
        headers: getAuthHeader()
      });

      if (!response.ok) {
        throw new Error("Failed to fetch chats");
      }

      const chats = await response.json();
      chatList.innerHTML = "";

      chats.forEach(chat => {
        const div = document.createElement("div");
        div.className = "chat-item";

        if (chat.id === currentChatId) {
          div.classList.add("active-chat");
        }

        const title = document.createElement("span");
        title.textContent = chat.title;

        const menuBtn = document.createElement("span");
        menuBtn.textContent = "⋮";
        menuBtn.className = "menu-btn";

        div.appendChild(title);
        div.appendChild(menuBtn);

        div.addEventListener("click", (e) => {
          if (e.target !== menuBtn) {
            loadChatMessages(chat.id);
          }
        });

        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showMenu(menuBtn, chat);
        });

        chatList.appendChild(div);
      });

    } catch (err) {
      showToast("Failed to load chats", "error");
    }
  }

  async function loadChatMessages(chatId) {
    try {
      const response = await fetch(`/chats/${chatId}`, {
        headers: getAuthHeader()
      });

      if (!response.ok) throw new Error("Failed to fetch messages");

      const messages = await response.json();

      chatMessages.innerHTML = "";
      currentChatId = chatId;

      messages.forEach(msg => {
        appendMessage(msg.content, msg.role);
      });

      const chatsResponse = await fetch("/chats/", {
        headers: getAuthHeader()
      });

      const chats = await chatsResponse.json();
      const currentChat = chats.find(c => c.id === chatId);

      if (currentChat) {
        updateDatasetUI(currentChat.file_name);
      }

      loadChats();

    } catch (err) {
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

    rename.onclick = async () => {
      const newTitle = prompt("Enter new name:");

      const error = validateTitle(newTitle);
      if (error) {
        showToast(error, "error");
        return;
      }

      if (!newTitle) return;

      await fetch(`/chats/${chat.id}`, {
        method: "PUT",
        headers: getAuthHeader(),
        body: new URLSearchParams({ title: newTitle })
      });

      loadChats();
      menu.remove();
    };

    del.onclick = async () => {
      const confirmDelete = confirm("Delete this chat?");
      if (!confirmDelete) return;

      await fetch(`/chats/${chat.id}`, {
        method: "DELETE",
        headers: getAuthHeader()
      });

      if (currentChatId === chat.id) {
        currentChatId = null;
        chatMessages.innerHTML = "";
        updateDatasetUI(null);
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
    updateDatasetUI(null);
    showToast("New chat started", "success");
    loadChats();
  });

  /* ============================= */
  /* Send Message */
  /* ============================= */

  sendBtn.addEventListener("click", async () => {
    const message = messageInput.value.trim();

    const error = validateQuery(message);
    if (error) {
      showToast(error, "error");
      return;
    }
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
        headers: getAuthHeader(),
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