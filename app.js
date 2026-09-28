const loginDialog = document.querySelector("#login-dialog");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const passwordInput = document.querySelector("#login-password");
const passwordToggle = document.querySelector("#password-toggle");

document.querySelector("#login-open").addEventListener("click", () => {
  loginStatus.textContent = "";
  loginDialog.showModal();
});

document.querySelector("#login-close").addEventListener("click", () => {
  loginDialog.close();
});

loginDialog.addEventListener("click", (event) => {
  if (event.target === loginDialog) {
    loginDialog.close();
  }
});

passwordToggle.addEventListener("click", () => {
  const isVisible = passwordInput.type === "text";
  passwordInput.type = isVisible ? "password" : "text";
  passwordToggle.textContent = isVisible ? "Show" : "Hide";
  passwordToggle.setAttribute("aria-pressed", String(!isVisible));
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginStatus.textContent = "Sign-in is not connected yet. Please try again when an account service is available.";
});