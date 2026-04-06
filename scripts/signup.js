document.addEventListener("DOMContentLoaded", () => {

  const signupBtn = document.getElementById("signupBtn");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const errorMsg = document.getElementById("errorMsg");

  const themeBtn = document.getElementById("themeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const goLogin = document.getElementById("goLogin");

  /* ============================= */
  /* THEME */
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
  /* SIGNUP */
  /* ============================= */

  signupBtn.addEventListener("click", async () => {

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
      const response = await fetch("/signup/", {
        method: "POST",
        body: formData
      });

      const result = await response.json();

      if (result.message) {
        alert("Signup successful! Please login.");
        window.location.href = "/login";
      } else {
        errorMsg.textContent = result.error || "Signup failed";
      }

    } catch {
      errorMsg.textContent = "Server error. Try again.";
    }

  });

  /* ============================= */
  /* REDIRECT */
  /* ============================= */

  goLogin.addEventListener("click", () => {
    window.location.href = "/login";
  });

});