document.addEventListener("DOMContentLoaded", () => {

  const loginBtn = document.getElementById("loginBtn");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const errorMsg = document.getElementById("errorMsg");

  const themeBtn = document.getElementById("themeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const goSignup = document.getElementById("goSignup");

  /* ============================= */
  /* THEME SYNC */
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
    const isDark = document.body.classList.contains("dark");
    setTheme(!isDark);
  });

  /* ============================= */
  /* LOGIN */
  /* ============================= */

  loginBtn.addEventListener("click", async () => {

    const emailVal = email.value.trim();
    const passwordVal = password.value.trim();

    if (!emailVal || !passwordVal) {
      errorMsg.textContent = "Please fill all fields";
      return;
    }

    const formData = new FormData();
    formData.append("email", emailVal);
    formData.append("password", passwordVal);

    try {
      const response = await fetch("/login/", {
        method: "POST",
        body: formData
      });

      const result = await response.json();

      if (result.access_token) {
        localStorage.setItem("token", result.access_token);
        window.location.href = "/";
      } else {
        errorMsg.textContent = result.error || "Login failed";
      }

    } catch {
      errorMsg.textContent = "Server error. Try again.";
    }

  });

  /* ============================= */
  /* SIGNUP REDIRECT */
  /* ============================= */

  goSignup.addEventListener("click", () => {
    window.location.href = "/signup";
  });

});