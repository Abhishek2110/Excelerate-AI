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
  /* VALIDATION */
  /* ============================= */

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validatePassword(password) {
    return password.length >= 6;
  }

  /* ============================= */
  /* SIGNUP FUNCTION */
  /* ============================= */

  async function handleSignup() {

    const emailVal = email.value.trim();
    const passwordVal = password.value.trim();

    // 🔥 EMPTY CHECK FIRST
    if (!emailVal || !passwordVal) {
      errorMsg.textContent = "Please fill all fields";
      return;
    }

    // 🔥 EMAIL VALIDATION
    if (!validateEmail(emailVal)) {
      errorMsg.textContent = "Enter a valid email address";
      return;
    }

    // 🔥 PASSWORD VALIDATION
    if (!validatePassword(passwordVal)) {
      errorMsg.textContent = "Password must be at least 6 characters";
      return;
    }

    errorMsg.textContent = "";

    // 🔥 UX improvement
    signupBtn.disabled = true;
    signupBtn.textContent = "Creating account...";

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
    } finally {
      signupBtn.disabled = false;
      signupBtn.textContent = "Sign Up";
    }
  }

  /* ============================= */
  /* CLICK */
  /* ============================= */

  signupBtn.addEventListener("click", handleSignup);

  /* ============================= */
  /* ENTER KEY SUPPORT */
  /* ============================= */

  function triggerSignupOnEnter(e) {
    if (e.key === "Enter") {
      handleSignup();
    }
  }

  email.addEventListener("keypress", triggerSignupOnEnter);
  password.addEventListener("keypress", triggerSignupOnEnter);

  /* ============================= */
  /* REDIRECT */
  /* ============================= */

  goLogin.addEventListener("click", () => {
    window.location.href = "/login";
  });

});