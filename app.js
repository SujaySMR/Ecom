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

const cartDialog = document.querySelector("#cart-dialog");
const cartItemsElement = document.querySelector("#cart-items");
const cartEmptyMessage = document.querySelector("#cart-empty");
const cartCountElement = document.querySelector("#cart-count");
const cartSubtotalElement = document.querySelector("#cart-subtotal");
const cartTaxElement = document.querySelector("#cart-tax");
const cartTotalElement = document.querySelector("#cart-total");
const cartStatus = document.querySelector("#cart-status");
const payButton = document.querySelector("#proceed-to-pay");
const taxRate = 0.08;
const cart = new Map();
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

document.querySelector("#cart-tax-rate").textContent = `${taxRate * 100}%`;

function renderCart() {
  cartItemsElement.replaceChildren();
  let itemCount = 0;
  let subtotal = 0;

  for (const [productId, item] of cart) {
    itemCount += item.quantity;
    subtotal += item.price * item.quantity;

    const row = document.createElement("li");
    row.className = "cart-item";

    const details = document.createElement("div");
    const name = document.createElement("p");
    name.className = "cart-item-name";
    name.textContent = item.name;
    const price = document.createElement("p");
    price.className = "cart-item-price";
    price.textContent = `${currency.format(item.price)} each`;
    details.append(name, price);

    const controls = document.createElement("div");
    controls.className = "cart-item-controls";
    controls.append(createCartButton("-", "Decrease quantity", "decrease", productId));
    const quantity = document.createElement("span");
    quantity.textContent = String(item.quantity);
    quantity.setAttribute("aria-label", `Quantity: ${item.quantity}`);
    controls.append(quantity);
    controls.append(
      createCartButton("+", "Increase quantity", "increase", productId),
      createCartButton("Remove", `Remove ${item.name}`, "remove", productId),
    );

    const lineTotal = document.createElement("strong");
    lineTotal.className = "cart-line-total";
    lineTotal.textContent = currency.format(item.price * item.quantity);
    row.append(details, controls, lineTotal);
    cartItemsElement.append(row);
  }

  const tax = Math.round(subtotal * taxRate * 100) / 100;
  cartCountElement.textContent = String(itemCount);
  cartSubtotalElement.textContent = currency.format(subtotal);
  cartTaxElement.textContent = currency.format(tax);
  cartTotalElement.textContent = currency.format(subtotal + tax);
  cartEmptyMessage.hidden = itemCount > 0;
  cartItemsElement.hidden = itemCount === 0;
  payButton.disabled = itemCount === 0;
}

function createCartButton(label, accessibleName, action, productId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = action === "remove" ? "remove-item" : "quantity-button";
  button.textContent = label;
  button.setAttribute("aria-label", accessibleName);
  button.dataset.cartAction = action;
  button.dataset.productId = productId;
  return button;
}

document.querySelector("#cart-open").addEventListener("click", () => {
  cartStatus.textContent = "";
  cartDialog.showModal();
});

document.querySelector("#cart-close").addEventListener("click", () => {
  cartDialog.close();
});

cartDialog.addEventListener("click", (event) => {
  if (event.target === cartDialog) {
    cartDialog.close();
  }
});

document.querySelector(".product-grid").addEventListener("click", (event) => {
  const addButton = event.target.closest(".product-info button");
  if (!addButton) return;

  const productCard = addButton.closest(".product-card-item");
  const name = productCard.querySelector("h3").textContent.trim();
  const price = Number(productCard.querySelector(".price").textContent.replace(/[^\d.]/g, ""));
  const productId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const currentItem = cart.get(productId);

  cart.set(productId, {
    name,
    price,
    quantity: currentItem ? currentItem.quantity + 1 : 1,
  });
  cartStatus.textContent = "";
  renderCart();
});

cartItemsElement.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-cart-action]");
  if (!button) return;

  const { cartAction, productId } = button.dataset;
  const item = cart.get(productId);
  if (!item) return;

  if (cartAction === "remove" || (cartAction === "decrease" && item.quantity === 1)) {
    cart.delete(productId);
  } else if (cartAction === "increase") {
    cart.set(productId, { ...item, quantity: item.quantity + 1 });
  } else if (cartAction === "decrease") {
    cart.set(productId, { ...item, quantity: item.quantity - 1 });
  }

  cartStatus.textContent = "";
  renderCart();
});

payButton.addEventListener("click", () => {
  if (cart.size === 0) return;
  cartStatus.textContent = "Demo checkout only. No payment was taken. Connect a payment provider to accept real payments.";
});

renderCart();