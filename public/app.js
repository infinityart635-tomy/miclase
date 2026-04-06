const year = document.getElementById("year");
const startButton = document.getElementById("startButton");
const backButton = document.getElementById("backButton");
const welcomePanel = document.getElementById("welcomePanel");
const loginPanel = document.getElementById("loginPanel");

year.textContent = new Date().getFullYear();

startButton.addEventListener("click", () => {
  welcomePanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
});

backButton.addEventListener("click", () => {
  loginPanel.classList.add("hidden");
  welcomePanel.classList.remove("hidden");
});
