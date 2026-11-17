const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const filePreviewMode = window.location.protocol === "file:";
const cartStorageKey = "forma-cart";
const wishlistStorageKey = "forma-wishlist";
const checkoutReferenceStorageKey = "forma-checkout-reference";
const freeShippingThresholdCents = 7500;
const standardShippingCents = 895;
const pageSize = 8;
const allowedImageThemes = new Set([
  "product-one",
  "product-two",
  "product-three",
  "product-four",
  "product-five",
  "product-six",
  "product-seven",
  "product-eight",
]);

const elements = {
  cartDialog: document.querySelector("#cart-dialog"),
  cartItems: document.querySelector("#cart-items"),
  cartEmpty: document.querySelector("#cart-empty"),
  cartCount: document.querySelector("#cart-count"),
  cartSubtotal: document.querySelector("#cart-subtotal"),
  cartDiscountSummary: document.querySelector("#cart-discount-summary"),
  cartDiscount: document.querySelector("#cart-discount"),
  cartTotal: document.querySelector("#cart-total"),
  cartShippingNote: document.querySelector("#shipping-note"),
  cartShippingSummary: document.querySelector("#cart-shipping-summary"),
  checkoutButton: document.querySelector("#checkout-button"),
  checkoutStatus: document.querySelector("#checkout-status"),
  checkoutFeedback: document.querySelector("#checkout-feedback"),
  clearCart: document.querySelector("#clear-cart"),
  couponForm: document.querySelector("#coupon-form"),
  couponCode: document.querySelector("#coupon-code"),
  couponStatus: document.querySelector("#coupon-status"),
  wishlistDialog: document.querySelector("#wishlist-dialog"),
  wishlistItems: document.querySelector("#wishlist-items"),
  wishlistEmpty: document.querySelector("#wishlist-empty"),
  wishlistCount: document.querySelector("#wishlist-count"),
  wishlistStatus: document.querySelector("#wishlist-status"),
  productGrid: document.querySelector("#product-grid"),
  catalogEmpty: document.querySelector("#catalog-empty"),
  catalogResultCount: document.querySelector("#catalog-result-count"),
  categoryFilters: document.querySelector("#category-filters"),
  productSearch: document.querySelector("#product-search"),
  productSort: document.querySelector("#product-sort"),
  catalogFilters: document.querySelector("#catalog-filters"),
  minimumPrice: document.querySelector("#filter-min-price"),
  maximumPrice: document.querySelector("#filter-max-price"),
  inStockOnly: document.querySelector("#filter-in-stock"),
  pagination: document.querySelector("#catalog-pagination"),
  previousPage: document.querySelector("#page-previous"),
  nextPage: document.querySelector("#page-next"),
  pageIndicator: document.querySelector("#page-indicator"),
  productDialog: document.querySelector("#product-dialog"),
  productDetailImage: document.querySelector("#product-detail-image"),
  productThumbnails: document.querySelector("#product-thumbnails"),
  productDetailCategory: document.querySelector("#product-detail-category"),
  productDetailTitle: document.querySelector("#product-detail-title"),
  productDetailPrice: document.querySelector("#product-detail-price"),
  productDetailDescription: document.querySelector("#product-detail-description"),
  productDetailStock: document.querySelector("#product-detail-stock"),
  productSpecifications: document.querySelector("#product-specifications"),
  productDetailStatus: document.querySelector("#product-detail-status"),
  loginDialog: document.querySelector("#login-dialog"),
  loginForm: document.querySelector("#login-form"),
  loginName: document.querySelector("#login-name"),
  loginNameLabel: document.querySelector("#login-name-label"),
  loginEmail: document.querySelector("#login-email"),
  loginPassword: document.querySelector("#login-password"),
  loginStatus: document.querySelector("#login-status"),
  loginTitle: document.querySelector("#login-title"),
  loginEyebrow: document.querySelector("#login-eyebrow"),
  loginSubmit: document.querySelector("#login-submit"),
  authView: document.querySelector("#auth-view"),
  accountView: document.querySelector("#account-view"),
  accountName: document.querySelector("#account-name"),
  accountEmail: document.querySelector("#account-email"),
  accountOrders: document.querySelector("#account-orders"),
  accountStatus: document.querySelector("#account-status"),
  loginOpen: document.querySelector("#login-open"),
  adminOpen: document.querySelector("#admin-open"),
  adminDialog: document.querySelector("#admin-dialog"),
  adminProductForm: document.querySelector("#admin-product-form"),
  adminProductId: document.querySelector("#admin-product-id"),
  adminProductName: document.querySelector("#admin-product-name"),
  adminProductSlug: document.querySelector("#admin-product-slug"),
  adminProductCategory: document.querySelector("#admin-product-category"),
  adminProductMaterial: document.querySelector("#admin-product-material"),
  adminProductPrice: document.querySelector("#admin-product-price"),
  adminProductStock: document.querySelector("#admin-product-stock"),
  adminProductRank: document.querySelector("#admin-product-rank"),
  adminProductDescription: document.querySelector("#admin-product-description"),
  adminProductImages: document.querySelector("#admin-product-images"),
  adminProductSpecs: document.querySelector("#admin-product-specs"),
  adminProductTheme: document.querySelector("#admin-product-theme"),
  adminProductList: document.querySelector("#admin-product-list"),
  adminProductStatus: document.querySelector("#admin-product-status"),
  adminCouponForm: document.querySelector("#admin-coupon-form"),
  adminCouponCode: document.querySelector("#admin-coupon-code"),
  adminCouponType: document.querySelector("#admin-coupon-type"),
  adminCouponValue: document.querySelector("#admin-coupon-value"),
  adminCouponMinimum: document.querySelector("#admin-coupon-minimum"),
  adminCouponLimit: document.querySelector("#admin-coupon-limit"),
  adminCouponList: document.querySelector("#admin-coupon-list"),
  adminCouponStatus: document.querySelector("#admin-coupon-status"),
  newsletterForm: document.querySelector("#newsletter-form"),
  newsletterStatus: document.querySelector("#newsletter-status"),
};

const cart = loadCart();
const wishlist = loadWishlist();
const productCache = new Map();
const catalogState = {
  category: "all",
  query: "",
  sort: "featured",
  minimumPriceCents: "",
  maximumPriceCents: "",
  inStock: false,
  page: 1,
  totalPages: 1,
};
let currentUser = null;
let checkoutAvailable = false;
let appliedCoupon = "";
let couponPreviewCents = 0;
let activeProduct = null;
let isRegistering = false;
let searchTimer = 0;

async function apiRequest(url, options = {}) {
  if (filePreviewMode) {
    if (!window.formaCatalogPreview) {
      throw new Error("The local catalog preview did not load. Reopen index.html from the project folder.");
    }
    return window.formaCatalogPreview.request(url, options);
  }

  const headers = new Headers(options.headers || {});
  const request = { ...options, headers, credentials: "same-origin" };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    request.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, request);
  let result = null;
  if (response.status !== 204) {
    try {
      result = await response.json();
    } catch (error) {
      throw new Error("The storefront returned an unreadable response.");
    }
  }
  if (!response.ok) {
    throw new Error(result?.error || "The request could not be completed.");
  }
  return result;
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatPrice(cents) {
  return currency.format(cents / 100);
}

function safeTheme(product) {
  return allowedImageThemes.has(product.imageTheme) ? product.imageTheme : "product-one";
}

function safeImageSource(source) {
  if (typeof source !== "string" || source.length > 500) return null;
  if (/^\/(?:assets|img)\/[a-zA-Z0-9._/-]+$/.test(source) && !source.includes("..")) {
    return source;
  }
  try {
    const url = new URL(source);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function loadCart() {
  try {
    const savedItems = JSON.parse(localStorage.getItem(cartStorageKey) || "[]");
    if (
      !Array.isArray(savedItems) ||
      savedItems.length > 100 ||
      savedItems.some(
        (item) =>
          !item ||
          typeof item.productId !== "string" ||
          item.productId.length > 80 ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 10,
      )
    ) {
      throw new TypeError("Saved cart data must contain product IDs and valid quantities.");
    }
    return new Map(savedItems.map((item) => [item.productId, item.quantity]));
  } catch (error) {
    console.error("Unable to load the saved cart.", error);
    elements.checkoutStatus.textContent = "Your saved bag could not be loaded in this browser.";
    return new Map();
  }
}

function loadWishlist() {
  try {
    const savedItems = JSON.parse(localStorage.getItem(wishlistStorageKey) || "[]");
    if (
      !Array.isArray(savedItems) ||
      savedItems.length > 100 ||
      savedItems.some((id) => typeof id !== "string" || id.length > 80)
    ) {
      throw new TypeError("Saved wishlist data must be an array of product IDs.");
    }
    return new Set(savedItems);
  } catch (error) {
    console.error("Unable to load the saved wishlist.", error);
    elements.wishlistStatus.textContent = "Your saved pieces could not be loaded in this browser.";
    return new Set();
  }
}

function persistLocalState() {
  try {
    localStorage.setItem(
      cartStorageKey,
      JSON.stringify([...cart].map(([productId, quantity]) => ({ productId, quantity }))),
    );
    localStorage.setItem(wishlistStorageKey, JSON.stringify([...wishlist]));
  } catch (error) {
    console.error("Unable to save storefront preferences in this browser.", error);
    elements.checkoutStatus.textContent = "Your changes are active but could not be saved in this browser.";
  }
  scheduleAccountPersistence();
}

let accountSaveTimer = 0;
function scheduleAccountPersistence() {
  if (!currentUser) return;
  window.clearTimeout(accountSaveTimer);
  accountSaveTimer = window.setTimeout(async () => {
    try {
      await apiRequest("/api/account/cart", {
        method: "PUT",
        body: {
          items: [...cart].map(([productId, quantity]) => ({ productId, quantity })),
        },
      });
      await apiRequest("/api/account/wishlist", {
        method: "PUT",
        body: { items: [...wishlist] },
      });
      elements.accountStatus.textContent = "Your bag and saved pieces are synced to your account.";
    } catch (error) {
      console.error("Unable to sync account shopping data.", error);
      elements.accountStatus.textContent = error.message;
    }
  }, 250);
}

async function ensureProduct(productId) {
  if (productCache.has(productId)) return productCache.get(productId);
  const result = await apiRequest(`/api/products/${encodeURIComponent(productId)}`);
  productCache.set(result.product.id, result.product);
  return result.product;
}

function updateCatalogStatus(message, isError = false) {
  elements.catalogResultCount.textContent =
    filePreviewMode && !isError ? `${message} · local file preview` : message;
  elements.catalogResultCount.classList.toggle("is-error", isError);
}

async function loadCategories() {
  const result = await apiRequest("/api/products/categories");
  const categoryCounts = result.categories;
  const total = categoryCounts.reduce((sum, item) => sum + item.product_count, 0);
  document.querySelector("#stat-products-count").textContent = String(total).padStart(2, "0");
  document.querySelector("#stat-categories-count").textContent =
    String(categoryCounts.length).padStart(2, "0");
  const fragment = document.createDocumentFragment();
  const options = [{ category: "all", label: "Everything", product_count: total }, ...categoryCounts.map((item) => ({
    ...item,
    label: item.category.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
  }))];

  for (const option of options) {
    const button = createElement("button", "category-filter", option.label);
    button.type = "button";
    button.dataset.category = option.category;
    button.setAttribute("aria-pressed", String(catalogState.category === option.category));
    const count = createElement("span", "", String(option.product_count).padStart(2, "0"));
    button.append(count);
    if (catalogState.category === option.category) button.classList.add("is-active");
    fragment.append(button);
  }
  elements.categoryFilters.replaceChildren(fragment);
}

async function loadProducts() {
  const parameters = new URLSearchParams({
    page: String(catalogState.page),
    pageSize: String(pageSize),
    sort: catalogState.sort,
  });
  if (catalogState.category !== "all") parameters.set("category", catalogState.category);
  if (catalogState.query) parameters.set("q", catalogState.query);
  if (catalogState.minimumPriceCents !== "") {
    parameters.set("minPrice", catalogState.minimumPriceCents);
  }
  if (catalogState.maximumPriceCents !== "") {
    parameters.set("maxPrice", catalogState.maximumPriceCents);
  }
  if (catalogState.inStock) parameters.set("inStock", "true");

  updateCatalogStatus("Scanning the collection…");
  try {
    const result = await apiRequest(`/api/products?${parameters.toString()}`);
    for (const product of result.items) productCache.set(product.id, product);
    catalogState.totalPages = Math.max(1, result.pagination.totalPages);
    if (catalogState.page > catalogState.totalPages) {
      catalogState.page = catalogState.totalPages;
      return loadProducts();
    }
    renderCatalog(result.items, result.pagination);
  } catch (error) {
    console.error("Unable to load the product catalog.", error);
    elements.productGrid.replaceChildren();
    elements.catalogEmpty.textContent = error.message;
    elements.catalogEmpty.hidden = false;
    elements.pagination.hidden = true;
    updateCatalogStatus("The collection could not be loaded.", true);
  }
}

function createProductCard(product, index) {
  const card = createElement("article", "product-card-item");
  card.dataset.productId = product.id;
  card.dataset.category = product.category;

  const image = createElement("div", `product-image ${safeTheme(product)}`);
  image.setAttribute("role", "img");
  image.setAttribute("aria-label", `${product.name}, ${product.material || product.category}`);
  const firstImage = Array.isArray(product.images)
    ? product.images.map(safeImageSource).find(Boolean)
    : null;
  if (firstImage) {
    const photo = createElement("img", "product-photo");
    photo.src = firstImage;
    photo.alt = product.name;
    photo.loading = "lazy";
    image.append(photo);
  }

  const badge = createElement(
    "span",
    "product-label",
    product.availableQuantity > 0 ? (product.featuredRank <= 2 ? "Studio pick" : "Forma object") : "Currently reserved",
  );
  image.append(badge);
  const saveButton = createElement("button", "wishlist-toggle", wishlist.has(product.id) ? "♥" : "♡");
  saveButton.type = "button";
  saveButton.dataset.productId = product.id;
  saveButton.setAttribute("aria-pressed", String(wishlist.has(product.id)));
  saveButton.setAttribute(
    "aria-label",
    `${wishlist.has(product.id) ? "Remove" : "Save"} ${product.name} ${wishlist.has(product.id) ? "from" : "to"} wishlist`,
  );
  image.append(saveButton);
  const imageIndex = createElement("span", "image-index", `${String(index + 1).padStart(2, "0")} / ${String(product.featuredRank).padStart(2, "0")}`);
  image.append(imageIndex);
  card.append(image);

  const info = createElement("div", "product-info");
  info.append(createElement("p", "product-category", `${product.category} · ${product.material || "Forma series"}`));
  const name = createElement("button", "product-title", product.name);
  name.type = "button";
  name.dataset.productDetails = product.id;
  info.append(name);
  info.append(createElement("p", "price", formatPrice(product.priceCents)));
  const stock = createElement(
    "p",
    product.availableQuantity > 0 ? "product-stock product-stock-available" : "product-stock product-stock-unavailable",
    product.availableQuantity > 0
      ? `${product.availableQuantity} available`
      : "Currently unavailable",
  );
  info.append(stock);
  const actions = createElement("div", "product-card-actions");
  const detailsButton = createElement("button", "view-product", "Explore object");
  detailsButton.type = "button";
  detailsButton.dataset.productDetails = product.id;
  const addButton = createElement("button", "add-to-cart", "Add to bag ↗");
  addButton.type = "button";
  addButton.dataset.productId = product.id;
  addButton.disabled = product.availableQuantity < 1;
  actions.append(detailsButton, addButton);
  info.append(actions);
  card.append(info);
  return card;
}

function renderCatalog(products, pagination) {
  const fragment = document.createDocumentFragment();
  products.forEach((product, index) => fragment.append(createProductCard(product, index)));
  elements.productGrid.replaceChildren(fragment);
  elements.catalogEmpty.hidden = products.length > 0;
  elements.catalogEmpty.textContent = "No pieces found. Adjust your filters and try again.";
  const firstResult = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const lastResult = Math.min(pagination.page * pagination.pageSize, pagination.total);
  updateCatalogStatus(
    pagination.total === 0
      ? "No objects match this signal."
      : `Showing ${firstResult}–${lastResult} of ${pagination.total} objects`,
  );
  elements.pagination.hidden = pagination.totalPages <= 1;
  elements.previousPage.disabled = pagination.page <= 1;
  elements.nextPage.disabled = pagination.page >= pagination.totalPages;
  elements.pageIndicator.textContent = `Page ${pagination.page} / ${Math.max(1, pagination.totalPages)}`;
  renderWishlistCount();
}

function setCategory(category) {
  catalogState.category = category;
  catalogState.page = 1;
  for (const button of elements.categoryFilters.querySelectorAll(".category-filter")) {
    const active = button.dataset.category === category;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  loadProducts();
}

function addProductToCart(productId) {
  const product = productCache.get(productId);
  if (!product) {
    elements.checkoutStatus.textContent = "That piece could not be found in the collection.";
    return;
  }
  const quantity = cart.get(productId) || 0;
  if (quantity >= 10) {
    elements.checkoutStatus.textContent = "A maximum of 10 of each piece can be added to your bag.";
    return;
  }
  if (quantity >= product.availableQuantity) {
    elements.checkoutStatus.textContent = `${product.name} has reached its available inventory.`;
    return;
  }
  cart.set(productId, quantity + 1);
  invalidateCoupon();
  persistLocalState();
  renderCart();
  elements.checkoutStatus.textContent = `${product.name} added to your bag.`;
}

function createCartButton(label, accessibleName, action, productId) {
  const button = createElement("button", action === "remove" ? "remove-item" : "quantity-button", label);
  button.type = "button";
  button.setAttribute("aria-label", accessibleName);
  button.dataset.cartAction = action;
  button.dataset.productId = productId;
  return button;
}

function renderCart() {
  elements.cartItems.replaceChildren();
  let itemCount = 0;
  let subtotalCents = 0;
  let hasUnavailableItem = false;

  for (const [productId, quantity] of cart) {
    itemCount += quantity;
    const product = productCache.get(productId);
    const row = createElement("li", "cart-item");
    const details = createElement("div");
    const name = createElement("p", "cart-item-name", product?.name || "Unavailable piece");
    const unitPrice = product ? `${formatPrice(product.priceCents)} each` : "Remove this item to continue.";
    details.append(name, createElement("p", "cart-item-price", unitPrice));
    const controls = createElement("div", "cart-item-controls");
    controls.append(createCartButton("−", "Decrease quantity", "decrease", productId));
    const quantityText = createElement("span", "", String(quantity));
    quantityText.setAttribute("aria-label", `Quantity: ${quantity}`);
    controls.append(quantityText);
    const increase = createCartButton("+", "Increase quantity", "increase", productId);
    increase.disabled = quantity >= 10 || !product || quantity >= product.availableQuantity;
    controls.append(increase, createCartButton("Remove", `Remove ${name.textContent}`, "remove", productId));
    const lineTotal = createElement(
      "strong",
      "cart-line-total",
      product ? formatPrice(product.priceCents * quantity) : "Unavailable",
    );
    if (product) subtotalCents += product.priceCents * quantity;
    else hasUnavailableItem = true;
    row.append(details, controls, lineTotal);
    elements.cartItems.append(row);
  }

  const discountCents = Math.min(couponPreviewCents, subtotalCents);
  const shippingCents = subtotalCents >= freeShippingThresholdCents ? 0 : standardShippingCents;
  elements.cartCount.textContent = String(itemCount);
  elements.cartSubtotal.textContent = formatPrice(subtotalCents);
  elements.cartDiscountSummary.hidden = !appliedCoupon || discountCents === 0;
  elements.cartDiscount.textContent = `−${formatPrice(discountCents)}`;
  elements.cartTotal.textContent = formatPrice(Math.max(0, subtotalCents - discountCents) + shippingCents);
  elements.cartEmpty.hidden = itemCount > 0;
  elements.cartItems.hidden = itemCount === 0;
  elements.checkoutButton.disabled =
    itemCount === 0 || !checkoutAvailable || hasUnavailableItem;
  elements.clearCart.hidden = itemCount === 0;
  elements.cartShippingNote.hidden = itemCount === 0;
  elements.cartShippingSummary.hidden = itemCount === 0;
  if (itemCount > 0 && shippingCents === 0) {
    elements.cartShippingNote.textContent = "Your order qualifies for complimentary worldwide delivery.";
    elements.cartShippingSummary.textContent = "Worldwide delivery · Complimentary";
  } else if (itemCount > 0) {
    elements.cartShippingNote.textContent =
      `Add ${formatPrice(freeShippingThresholdCents - subtotalCents)} more for complimentary worldwide delivery.`;
    elements.cartShippingSummary.textContent = `Worldwide delivery · ${formatPrice(shippingCents)}`;
  } else {
    elements.cartShippingSummary.textContent = "";
  }
  if (hasUnavailableItem) {
    elements.checkoutStatus.textContent = "Remove unavailable pieces before checking out.";
  }
}

function renderWishlistCount() {
  elements.wishlistCount.textContent = String(wishlist.size);
  for (const button of elements.productGrid.querySelectorAll(".wishlist-toggle")) {
    const productId = button.dataset.productId;
    const saved = wishlist.has(productId);
    button.textContent = saved ? "♥" : "♡";
    button.setAttribute("aria-pressed", String(saved));
    const product = productCache.get(productId);
    button.setAttribute(
      "aria-label",
      `${saved ? "Remove" : "Save"} ${product?.name || "piece"} ${saved ? "from" : "to"} wishlist`,
    );
  }
}

function renderWishlist() {
  elements.wishlistItems.replaceChildren();
  for (const productId of wishlist) {
    const product = productCache.get(productId);
    const row = createElement("li", "wishlist-item");
    const details = createElement("div");
    details.append(
      createElement("p", "cart-item-name", product?.name || "Unavailable piece"),
      createElement("p", "cart-item-price", product ? formatPrice(product.priceCents) : "No longer in the collection"),
    );
    const actions = createElement("div", "wishlist-item-actions");
    if (product) {
      const addButton = createElement("button", "wishlist-add", "Add to bag");
      addButton.type = "button";
      addButton.dataset.wishlistAction = "add";
      addButton.dataset.productId = productId;
      actions.append(addButton);
    }
    const removeButton = createElement("button", "wishlist-remove", "Remove");
    removeButton.type = "button";
    removeButton.dataset.wishlistAction = "remove";
    removeButton.dataset.productId = productId;
    removeButton.setAttribute("aria-label", `Remove ${product?.name || "piece"} from wishlist`);
    actions.append(removeButton);
    row.append(details, actions);
    elements.wishlistItems.append(row);
  }
  const hasItems = wishlist.size > 0;
  elements.wishlistEmpty.hidden = hasItems;
  elements.wishlistItems.hidden = !hasItems;
  renderWishlistCount();
}

function toggleWishlist(productId) {
  if (wishlist.has(productId)) wishlist.delete(productId);
  else wishlist.add(productId);
  persistLocalState();
  renderWishlist();
}

function invalidateCoupon() {
  if (!appliedCoupon) return;
  appliedCoupon = "";
  couponPreviewCents = 0;
  elements.couponStatus.textContent = "Your bag changed. Apply the code again to refresh the estimate.";
  renderCart();
}

function displayProductImage(product, source, view = 1) {
  elements.productDetailImage.replaceChildren();
  elements.productDetailImage.className =
    `product-detail-image ${safeTheme(product)} gallery-view-${view}`;
  const imageSource = safeImageSource(source);
  if (imageSource) {
    const image = createElement("img", "product-detail-photo");
    image.src = imageSource;
    image.alt = product.name;
    elements.productDetailImage.append(image);
  }
}

function renderProductDetails(product) {
  activeProduct = product;
  elements.productDetailCategory.textContent =
    `${product.category} · ${product.material || "Forma series"}`;
  elements.productDetailTitle.textContent = product.name;
  elements.productDetailPrice.textContent = formatPrice(product.priceCents);
  elements.productDetailDescription.textContent = product.description || "A considered object from the Forma collection.";
  elements.productDetailStock.textContent =
    product.availableQuantity > 0
      ? `${product.availableQuantity} available for dispatch`
      : "Currently unavailable";
  elements.productDetailStatus.textContent = "";
  elements.productThumbnails.replaceChildren();
  const images = Array.isArray(product.images) ? product.images.map(safeImageSource).filter(Boolean) : [];
  if (images.length === 0) {
    const views = ["Form", "Material", "Light"];
    views.forEach((label, index) => {
      const thumbnail = createElement(
        "button",
        `product-thumbnail${index === 0 ? " is-active" : ""}`,
        label,
      );
      thumbnail.type = "button";
      thumbnail.setAttribute("aria-label", `${product.name} ${label.toLowerCase()} view`);
      thumbnail.addEventListener("click", () => {
        displayProductImage(product, null, index + 1);
        for (const button of elements.productThumbnails.children) {
          button.classList.toggle("is-active", button === thumbnail);
        }
      });
      elements.productThumbnails.append(thumbnail);
    });
    displayProductImage(product, null);
  } else {
    images.forEach((image, index) => {
      const thumbnail = createElement("button", "product-thumbnail");
      thumbnail.type = "button";
      thumbnail.setAttribute("aria-label", `${product.name} image ${index + 1}`);
      const photo = createElement("img");
      photo.src = image;
      photo.alt = "";
      thumbnail.append(photo);
      thumbnail.addEventListener("click", () => {
        displayProductImage(product, image, Math.min(index + 1, 3));
        for (const button of elements.productThumbnails.children) {
          button.classList.toggle("is-active", button === thumbnail);
        }
      });
      if (index === 0) thumbnail.classList.add("is-active");
      elements.productThumbnails.append(thumbnail);
    });
    displayProductImage(product, images[0]);
  }

  elements.productSpecifications.replaceChildren();
  const specifications = product.specifications || {};
  for (const [label, value] of Object.entries(specifications)) {
    const term = createElement("dt", "", label);
    const definition = createElement("dd", "", String(value));
    elements.productSpecifications.append(term, definition);
  }
  elements.productSpecifications.hidden = Object.keys(specifications).length === 0;
  const addButton = document.querySelector("#product-add-to-cart");
  addButton.disabled = product.availableQuantity < 1;
  document.querySelector("#product-save").textContent = wishlist.has(product.id)
    ? "Saved to wishlist"
    : "Save piece";
}

async function openProduct(productIdOrSlug, { updateUrl = true } = {}) {
  try {
    let product = productCache.get(productIdOrSlug);
    if (!product) product = await ensureProduct(productIdOrSlug);
    renderProductDetails(product);
    if (!elements.productDialog.open) elements.productDialog.showModal();
    if (updateUrl) {
      const productRoute = filePreviewMode
        ? `${window.location.pathname}?product=${encodeURIComponent(product.slug)}#catalog`
        : `/products/${encodeURIComponent(product.slug)}`;
      history.pushState({ productRoute: true }, "", productRoute);
    }
  } catch (error) {
    console.error("Unable to load product details.", error);
    elements.productDetailStatus.textContent = error.message;
    if (!elements.productDialog.open) elements.productDialog.showModal();
  }
}

function closeProductRoute() {
  if (filePreviewMode) {
    if (new URLSearchParams(window.location.search).has("product")) {
      history.replaceState({}, "", `${window.location.pathname}#catalog`);
    }
    return;
  }
  if (window.location.pathname.startsWith("/products/")) {
    history.replaceState({}, "", "/#catalog");
  }
}

function serializeCart() {
  return [...cart].map(([productId, quantity]) => ({ productId, quantity }));
}

async function synchronizeAccountShoppingData() {
  const result = await apiRequest("/api/account/sync", {
    method: "POST",
    body: {
      cart: serializeCart(),
      wishlist: [...wishlist],
    },
  });
  cart.clear();
  for (const item of result.cart) cart.set(item.productId, item.quantity);
  const wishlistResult = await apiRequest("/api/account/wishlist");
  wishlist.clear();
  for (const item of wishlistResult.items) {
    const product = {
      id: item.id,
      slug: item.slug,
      name: item.name,
      category: item.category,
      priceCents: item.price_cents,
      imageTheme: item.image_theme,
      images: item.images,
    };
    productCache.set(product.id, product);
    wishlist.add(product.id);
  }

  const productIds = [...new Set([...cart.keys(), ...wishlist])];
  await Promise.all(
    productIds.map(async (productId) => {
      if (!productCache.has(productId)) {
        try {
          await ensureProduct(productId);
        } catch (error) {
          console.error(`Unable to load saved product ${productId}.`, error);
        }
      }
    }),
  );
  persistLocalState();
  renderCart();
  renderWishlist();
  if (result.removedProductIds.length > 0) {
    elements.accountStatus.textContent =
      "A few archived pieces were removed from your saved bag or wishlist.";
  }
}

function updateAccountButton() {
  elements.loginOpen.textContent = currentUser ? "Account" : "Log in";
  elements.adminOpen.hidden = !currentUser?.isAdmin;
}

function setAuthMode(registering) {
  isRegistering = registering;
  elements.loginTitle.textContent = registering ? "Create your account" : "Welcome to Forma";
  elements.loginEyebrow.textContent = registering ? "Your Forma identity" : "Welcome back";
  elements.loginName.hidden = !registering;
  elements.loginNameLabel.hidden = !registering;
  elements.loginName.required = registering;
  elements.loginPassword.autocomplete = registering ? "new-password" : "current-password";
  elements.loginSubmit.textContent = registering ? "Create account" : "Log in";
  document.querySelector("#auth-mode-toggle").textContent =
    registering ? "Already have an account? Log in" : "Create an account";
  elements.loginStatus.textContent = "";
}

async function loadAccountOrders() {
  elements.accountOrders.replaceChildren();
  elements.accountStatus.textContent = "Loading your order history…";
  try {
    const result = await apiRequest("/api/account/orders");
    if (result.orders.length === 0) {
      elements.accountOrders.append(createElement("li", "account-order-empty", "Your first Forma order will appear here."));
    }
    for (const order of result.orders) {
      const row = createElement("li", "account-order");
      const summary = createElement("div", "account-order-summary");
      const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(order.created_at));
      summary.append(
        createElement("strong", "", `Order ${order.id.slice(0, 8).toUpperCase()}`),
        createElement("span", "", date),
      );
      const itemSummary = order.items
        .map((item) => `${item.productName} × ${item.quantity}`)
        .join(", ");
      row.append(
        summary,
        createElement("p", "account-order-items", itemSummary),
        createElement("strong", "account-order-total", formatPrice(order.total_cents)),
      );
      elements.accountOrders.append(row);
    }
    elements.accountStatus.textContent = "";
  } catch (error) {
    console.error("Unable to load order history.", error);
    elements.accountStatus.textContent = error.message;
  }
}

function openAccountDialog() {
  if (currentUser) {
    elements.authView.hidden = true;
    elements.accountView.hidden = false;
    elements.loginTitle.textContent = "Your Forma account";
    elements.loginEyebrow.textContent = "Your collection";
    elements.accountName.textContent = currentUser.name;
    elements.accountEmail.textContent = currentUser.email;
    loadAccountOrders();
  } else {
    elements.authView.hidden = false;
    elements.accountView.hidden = true;
    setAuthMode(false);
  }
  if (!elements.loginDialog.open) elements.loginDialog.showModal();
}

async function startCheckout() {
  if (!checkoutAvailable) {
    elements.checkoutStatus.textContent =
      "Start the storefront with PostgreSQL and configure a Stripe test key to check out.";
    return;
  }
  if (cart.size === 0) {
    elements.checkoutStatus.textContent = "Add a piece to your bag before checking out.";
    return;
  }
  elements.checkoutButton.disabled = true;
  elements.checkoutStatus.textContent = "Preparing your secure checkout…";
  try {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    const cartReference = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    const result = await apiRequest("/api/create-checkout-session", {
      method: "POST",
      body: {
        cartReference,
        items: serializeCart(),
        ...(appliedCoupon ? { couponCode: appliedCoupon } : {}),
      },
    });
    if (typeof result.url !== "string" || !result.url.startsWith("https://checkout.stripe.com/")) {
      throw new Error("The payment provider returned an invalid checkout address.");
    }
    window.sessionStorage.setItem(checkoutReferenceStorageKey, cartReference);
    window.location.assign(result.url);
  } catch (error) {
    console.error("Unable to start secure checkout.", error);
    elements.checkoutStatus.textContent = error.message;
    elements.checkoutButton.disabled = cart.size === 0 || !checkoutAvailable;
  }
}

async function restoreCheckoutFeedback() {
  const query = new URLSearchParams(window.location.search);
  const checkoutState = query.get("checkout");
  if (checkoutState === "cancelled") {
    elements.checkoutFeedback.textContent = "Checkout was cancelled. Your bag is saved whenever you're ready.";
    elements.checkoutFeedback.hidden = false;
    history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
    return;
  }
  if (checkoutState !== "success") return;

  const sessionId = query.get("session_id");
  const cartReference = window.sessionStorage.getItem(checkoutReferenceStorageKey);
  if (!sessionId || !cartReference) {
    elements.checkoutFeedback.textContent =
      "We couldn't verify this payment. Please contact the studio before placing another order.";
    elements.checkoutFeedback.hidden = false;
    return;
  }

  elements.checkoutFeedback.textContent = "Confirming your payment…";
  elements.checkoutFeedback.hidden = false;
  try {
    const result = await apiRequest(
      `/api/checkout-session?session_id=${encodeURIComponent(sessionId)}&cart_reference=${encodeURIComponent(cartReference)}`,
    );
    if (result.paymentStatus !== "paid" || !Number.isSafeInteger(result.amountTotal)) {
      throw new Error("This payment has not been confirmed yet.");
    }
    cart.clear();
    invalidateCoupon();
    persistLocalState();
    renderCart();
    window.sessionStorage.removeItem(checkoutReferenceStorageKey);
    history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
    elements.checkoutFeedback.textContent =
      `Thank you for your order. Your payment of ${formatPrice(result.amountTotal)} is confirmed.`;
  } catch (error) {
    console.error("Unable to verify the completed payment.", error);
    elements.checkoutFeedback.textContent =
      "Your payment status couldn't be verified automatically. Please contact the studio before placing another order.";
  }
}

async function loadCheckoutAvailability() {
  try {
    const configuration = await apiRequest("/api/config");
    checkoutAvailable = configuration.checkoutAvailable === true;
    elements.checkoutStatus.textContent = checkoutAvailable
      ? ""
      : filePreviewMode
        ? "This is a local catalog preview. Run the app with PostgreSQL and Stripe to enable checkout."
        : "Secure payments are not configured. Add a Stripe test key to .env.";
  } catch (error) {
    console.error("Unable to load storefront configuration.", error);
    checkoutAvailable = false;
    elements.checkoutStatus.textContent = "Run the PostgreSQL-backed storefront to enable secure checkout.";
  }
  renderCart();
}

async function applyCoupon(event) {
  event.preventDefault();
  const couponCode = elements.couponCode.value.trim().toUpperCase();
  elements.couponStatus.textContent = "Checking your studio code…";
  try {
    const result = await apiRequest("/api/validate-coupon", {
      method: "POST",
      body: { couponCode, items: serializeCart() },
    });
    appliedCoupon = result.code;
    couponPreviewCents = result.discountCents;
    elements.couponStatus.textContent =
      `${result.code} applied · estimated savings ${formatPrice(result.discountCents)}.`;
    renderCart();
  } catch (error) {
    appliedCoupon = "";
    couponPreviewCents = 0;
    elements.couponStatus.textContent = error.message;
    renderCart();
  }
}

function renderAdminProducts(products) {
  elements.adminProductList.replaceChildren();
  for (const product of products) {
    const row = createElement("li", "admin-product-row");
    const details = createElement("div", "admin-product-summary");
    details.append(
      createElement("strong", "", product.name),
      createElement(
        "span",
        "",
        `${formatPrice(product.priceCents)} · ${product.availableQuantity} available · ${product.active ? "Live" : "Archived"}`,
      ),
    );
    const actions = createElement("div", "admin-product-actions");
    const edit = createElement("button", "text-button", "Edit");
    edit.type = "button";
    edit.dataset.adminAction = "edit-product";
    edit.dataset.productId = product.id;
    const archive = createElement("button", "text-button admin-archive", product.active ? "Archive" : "Archived");
    archive.type = "button";
    archive.disabled = !product.active;
    archive.dataset.adminAction = "archive-product";
    archive.dataset.productId = product.id;
    actions.append(edit, archive);
    row.append(details, actions);
    elements.adminProductList.append(row);
  }
}

async function loadAdminData() {
  elements.adminProductStatus.textContent = "Loading catalog controls…";
  try {
    const [productResult, couponResult] = await Promise.all([
      apiRequest("/api/admin/products"),
      apiRequest("/api/admin/coupons"),
    ]);
    for (const product of productResult.products) productCache.set(product.id, product);
    renderAdminProducts(productResult.products);
    renderAdminCoupons(couponResult.coupons);
    elements.adminProductStatus.textContent = "";
  } catch (error) {
    console.error("Unable to load studio controls.", error);
    elements.adminProductStatus.textContent = error.message;
  }
}

function renderAdminCoupons(coupons) {
  elements.adminCouponList.replaceChildren();
  for (const coupon of coupons) {
    const row = createElement("li", "admin-coupon-row");
    const details = createElement("div");
    const amount =
      coupon.discount_type === "percent"
        ? `${coupon.discount_value}% off`
        : `${formatPrice(coupon.discount_value)} off`;
    details.append(
      createElement("strong", "", coupon.code),
      createElement("span", "", `${amount} · ${coupon.redeemed_count} redeemed · ${coupon.active ? "Active" : "Paused"}`),
    );
    const toggle = createElement("button", "text-button", coupon.active ? "Pause" : "Activate");
    toggle.type = "button";
    toggle.dataset.adminAction = "toggle-coupon";
    toggle.dataset.couponId = coupon.id;
    toggle.dataset.active = String(!coupon.active);
    row.append(details, toggle);
    elements.adminCouponList.append(row);
  }
}

function resetAdminProductForm() {
  elements.adminProductForm.reset();
  elements.adminProductId.value = "";
  elements.adminProductRank.value = "1000";
  elements.adminProductTheme.value = "product-one";
  elements.adminProductStatus.textContent = "";
}

function editAdminProduct(product) {
  elements.adminProductId.value = product.id;
  elements.adminProductName.value = product.name;
  elements.adminProductSlug.value = product.slug;
  elements.adminProductCategory.value = product.category;
  elements.adminProductMaterial.value = product.material || "";
  elements.adminProductPrice.value = (product.priceCents / 100).toFixed(2);
  elements.adminProductStock.value = String(product.stockQuantity);
  elements.adminProductRank.value = String(product.featuredRank);
  elements.adminProductDescription.value = product.description || "";
  elements.adminProductImages.value = (product.images || []).join("\n");
  elements.adminProductSpecs.value = Object.entries(product.specifications || {})
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
  elements.adminProductTheme.value = safeTheme(product);
  elements.adminProductStatus.textContent = `Editing ${product.name}.`;
  elements.adminProductName.focus();
}

function parseSpecifications(value) {
  const specifications = {};
  for (const line of value.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error("Write each specification as Key: Value.");
    specifications[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return specifications;
}

async function saveAdminProduct(event) {
  event.preventDefault();
  const id = elements.adminProductId.value;
  const price = Number(elements.adminProductPrice.value);
  const minimumFieldsValid =
    Number.isFinite(price) &&
    price > 0 &&
    Number.isInteger(Number(elements.adminProductStock.value)) &&
    Number.isInteger(Number(elements.adminProductRank.value));
  if (!minimumFieldsValid) {
    elements.adminProductStatus.textContent = "Enter a valid price, stock quantity, and featured order.";
    return;
  }
  const body = {
    name: elements.adminProductName.value,
    slug: elements.adminProductSlug.value,
    category: elements.adminProductCategory.value,
    material: elements.adminProductMaterial.value,
    priceCents: Math.round(price * 100),
    stockQuantity: Number(elements.adminProductStock.value),
    featuredRank: Number(elements.adminProductRank.value),
    description: elements.adminProductDescription.value,
    images: elements.adminProductImages.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
    specifications: parseSpecifications(elements.adminProductSpecs.value),
    imageTheme: elements.adminProductTheme.value,
    active: true,
  };
  elements.adminProductStatus.textContent = "Saving product…";
  try {
    await apiRequest(id ? `/api/admin/products/${encodeURIComponent(id)}` : "/api/admin/products", {
      method: id ? "PUT" : "POST",
      body,
    });
    resetAdminProductForm();
    await Promise.all([loadAdminData(), loadCategories(), loadProducts()]);
  } catch (error) {
    console.error("Unable to save product.", error);
    elements.adminProductStatus.textContent = error.message;
  }
}

async function saveAdminCoupon(event) {
  event.preventDefault();
  const discountType = elements.adminCouponType.value;
  const value = Number(elements.adminCouponValue.value);
  const minimum = Number(elements.adminCouponMinimum.value || "0");
  const limit = elements.adminCouponLimit.value;
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(minimum) || minimum < 0) {
    elements.adminCouponStatus.textContent = "Enter a valid discount and minimum subtotal.";
    return;
  }
  if (discountType === "percent" && !Number.isInteger(value)) {
    elements.adminCouponStatus.textContent = "Percentage discounts must be whole numbers.";
    return;
  }
  elements.adminCouponStatus.textContent = "Creating discount code…";
  const body = {
    code: elements.adminCouponCode.value,
    ...(discountType === "percent"
      ? { percentOff: value }
      : { amountOffCents: Math.round(value * 100) }),
    minimumSubtotalCents: Math.round(minimum * 100),
    ...(limit ? { maxRedemptions: Number(limit) } : {}),
  };
  try {
    await apiRequest("/api/admin/coupons", { method: "POST", body });
    elements.adminCouponForm.reset();
    elements.adminCouponMinimum.value = "0";
    elements.adminCouponStatus.textContent = "Discount code created.";
    const result = await apiRequest("/api/admin/coupons");
    renderAdminCoupons(result.coupons);
  } catch (error) {
    console.error("Unable to create discount code.", error);
    elements.adminCouponStatus.textContent = error.message;
  }
}

async function initialize() {
  try {
    await loadCategories();
  } catch (error) {
    console.error("Unable to load product categories.", error);
  }
  await loadProducts();
  const savedProductIds = [...new Set([...cart.keys(), ...wishlist])];
  await Promise.all(
    savedProductIds.map(async (productId) => {
      try {
        await ensureProduct(productId);
      } catch (error) {
        console.error(`Saved product ${productId} is no longer available.`, error);
      }
    }),
  );
  renderWishlist();
  renderCart();
  try {
    const session = await apiRequest("/api/auth/session");
    currentUser = session.user;
    updateAccountButton();
    if (currentUser) await synchronizeAccountShoppingData();
  } catch (error) {
    console.error("Unable to restore the customer session.", error);
  }
  await loadCheckoutAvailability();

  const fileProductRoute = filePreviewMode
    ? new URLSearchParams(window.location.search).get("product")
    : null;
  const appProductRoute = window.location.pathname.match(/^\/products\/([^/]+)$/);
  const initialProductRoute = fileProductRoute || appProductRoute?.[1];
  if (initialProductRoute) {
    await openProduct(decodeURIComponent(initialProductRoute), { updateUrl: false });
  }
  await restoreCheckoutFeedback();
  renderCart();
  renderWishlist();
}

elements.productSearch.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    catalogState.query = elements.productSearch.value.trim();
    catalogState.page = 1;
    loadProducts();
  }, 220);
});
elements.productSort.addEventListener("change", () => {
  catalogState.sort = elements.productSort.value;
  catalogState.page = 1;
  loadProducts();
});
elements.categoryFilters.addEventListener("click", (event) => {
  const button = event.target.closest(".category-filter");
  if (button) setCategory(button.dataset.category);
});
elements.catalogFilters.addEventListener("submit", (event) => {
  event.preventDefault();
  const minimum = elements.minimumPrice.value.trim();
  const maximum = elements.maximumPrice.value.trim();
  if ((minimum && Number(minimum) < 0) || (maximum && Number(maximum) < 0)) {
    updateCatalogStatus("Prices cannot be negative.", true);
    return;
  }
  catalogState.minimumPriceCents = minimum ? String(Math.round(Number(minimum) * 100)) : "";
  catalogState.maximumPriceCents = maximum ? String(Math.round(Number(maximum) * 100)) : "";
  catalogState.inStock = elements.inStockOnly.checked;
  catalogState.page = 1;
  loadProducts();
});
elements.catalogFilters.addEventListener("reset", () => {
  window.setTimeout(() => {
    catalogState.minimumPriceCents = "";
    catalogState.maximumPriceCents = "";
    catalogState.inStock = false;
    catalogState.page = 1;
    loadProducts();
  }, 0);
});
elements.previousPage.addEventListener("click", () => {
  if (catalogState.page <= 1) return;
  catalogState.page -= 1;
  loadProducts();
});
elements.nextPage.addEventListener("click", () => {
  if (catalogState.page >= catalogState.totalPages) return;
  catalogState.page += 1;
  loadProducts();
});
elements.productGrid.addEventListener("click", (event) => {
  const detailsButton = event.target.closest("[data-product-details]");
  if (detailsButton) {
    openProduct(detailsButton.dataset.productDetails);
    return;
  }
  const wishlistButton = event.target.closest(".wishlist-toggle");
  if (wishlistButton) {
    toggleWishlist(wishlistButton.dataset.productId);
    return;
  }
  const addButton = event.target.closest(".add-to-cart");
  if (addButton) addProductToCart(addButton.dataset.productId);
});
elements.productDialog.addEventListener("click", (event) => {
  if (event.target === elements.productDialog) elements.productDialog.close();
});
elements.productDialog.addEventListener("close", closeProductRoute);
document.querySelector("#product-close").addEventListener("click", () => elements.productDialog.close());
document.querySelector("#product-add-to-cart").addEventListener("click", () => {
  if (activeProduct) addProductToCart(activeProduct.id);
});
document.querySelector("#product-save").addEventListener("click", () => {
  if (!activeProduct) return;
  toggleWishlist(activeProduct.id);
  document.querySelector("#product-save").textContent = wishlist.has(activeProduct.id)
    ? "Saved to wishlist"
    : "Save piece";
});
elements.cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-cart-action]");
  if (!button) return;
  const productId = button.dataset.productId;
  const quantity = cart.get(productId);
  if (!quantity) return;
  if (button.dataset.cartAction === "remove" || (button.dataset.cartAction === "decrease" && quantity === 1)) {
    cart.delete(productId);
  } else if (button.dataset.cartAction === "increase") {
    const product = productCache.get(productId);
    if (!product || quantity >= product.availableQuantity || quantity >= 10) return;
    cart.set(productId, quantity + 1);
  } else if (button.dataset.cartAction === "decrease") {
    cart.set(productId, quantity - 1);
  }
  invalidateCoupon();
  persistLocalState();
  renderCart();
});
elements.clearCart.addEventListener("click", () => {
  cart.clear();
  invalidateCoupon();
  persistLocalState();
  renderCart();
});
elements.couponForm.addEventListener("submit", applyCoupon);
elements.wishlistItems.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-wishlist-action]");
  if (!button) return;
  if (button.dataset.wishlistAction === "add") addProductToCart(button.dataset.productId);
  else {
    wishlist.delete(button.dataset.productId);
    persistLocalState();
    renderWishlist();
  }
});
document.querySelector("#cart-open").addEventListener("click", () => {
  if (!elements.cartDialog.open) elements.cartDialog.showModal();
});
document.querySelector("#cart-close").addEventListener("click", () => elements.cartDialog.close());
elements.cartDialog.addEventListener("click", (event) => {
  if (event.target === elements.cartDialog) elements.cartDialog.close();
});
document.querySelector("#wishlist-open").addEventListener("click", () => {
  renderWishlist();
  elements.wishlistDialog.showModal();
});
document.querySelector("#wishlist-close").addEventListener("click", () => elements.wishlistDialog.close());
document.querySelector("#wishlist-shop").addEventListener("click", () => elements.wishlistDialog.close());
elements.wishlistDialog.addEventListener("click", (event) => {
  if (event.target === elements.wishlistDialog) elements.wishlistDialog.close();
});
document.querySelector("#checkout-button").addEventListener("click", startCheckout);
elements.loginOpen.addEventListener("click", openAccountDialog);
document.querySelector("#login-close").addEventListener("click", () => elements.loginDialog.close());
elements.loginDialog.addEventListener("click", (event) => {
  if (event.target === elements.loginDialog) elements.loginDialog.close();
});
document.querySelector("#password-toggle").addEventListener("click", (event) => {
  const visible = elements.loginPassword.type === "text";
  elements.loginPassword.type = visible ? "password" : "text";
  event.currentTarget.textContent = visible ? "Show" : "Hide";
  event.currentTarget.setAttribute("aria-pressed", String(!visible));
});
document.querySelector("#auth-mode-toggle").addEventListener("click", () => setAuthMode(!isRegistering));
elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const endpoint = isRegistering ? "/api/auth/register" : "/api/auth/login";
  elements.loginStatus.textContent = "Connecting to Forma…";
  try {
    const result = await apiRequest(endpoint, {
      method: "POST",
      body: {
        ...(isRegistering ? { name: elements.loginName.value.trim() } : {}),
        email: elements.loginEmail.value,
        password: elements.loginPassword.value,
      },
    });
    currentUser = result.user;
    updateAccountButton();
    elements.authView.hidden = true;
    elements.accountView.hidden = false;
    elements.loginTitle.textContent = "Your Forma account";
    elements.loginEyebrow.textContent = "Your collection";
    elements.accountName.textContent = currentUser.name;
    elements.accountEmail.textContent = currentUser.email;
    try {
      await synchronizeAccountShoppingData();
    } catch (error) {
      console.error("Unable to sync account shopping data after sign-in.", error);
      elements.accountStatus.textContent = error.message;
    }
    await loadAccountOrders();
  } catch (error) {
    console.error("Unable to authenticate customer.", error);
    elements.loginStatus.textContent = error.message;
  }
});
document.querySelector("#orders-refresh").addEventListener("click", loadAccountOrders);
document.querySelector("#account-logout").addEventListener("click", async () => {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
    currentUser = null;
    updateAccountButton();
    elements.loginDialog.close();
    elements.accountStatus.textContent = "You are signed out. Your bag remains saved on this device.";
  } catch (error) {
    console.error("Unable to sign out.", error);
    elements.accountStatus.textContent = error.message;
  }
});
elements.adminOpen.addEventListener("click", () => {
  if (!currentUser?.isAdmin) return;
  resetAdminProductForm();
  loadAdminData();
  elements.adminDialog.showModal();
});
document.querySelector("#admin-close").addEventListener("click", () => elements.adminDialog.close());
elements.adminDialog.addEventListener("click", (event) => {
  if (event.target === elements.adminDialog) elements.adminDialog.close();
});
document.querySelector("#admin-product-reset").addEventListener("click", resetAdminProductForm);
elements.adminProductName.addEventListener("input", () => {
  if (elements.adminProductId.value || elements.adminProductSlug.value) return;
  elements.adminProductSlug.value = elements.adminProductName.value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
});
elements.adminProductForm.addEventListener("submit", saveAdminProduct);
elements.adminCouponForm.addEventListener("submit", saveAdminCoupon);
elements.adminProductList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-admin-action]");
  if (!button) return;
  if (button.dataset.adminAction === "edit-product") {
    const product = productCache.get(button.dataset.productId);
    if (product) editAdminProduct(product);
    return;
  }
  if (button.dataset.adminAction === "archive-product") {
    if (!window.confirm("Archive this piece from the live collection?")) return;
    try {
      await apiRequest(`/api/admin/products/${encodeURIComponent(button.dataset.productId)}`, {
        method: "DELETE",
      });
      await Promise.all([loadAdminData(), loadCategories(), loadProducts()]);
    } catch (error) {
      console.error("Unable to archive product.", error);
      elements.adminProductStatus.textContent = error.message;
    }
  }
});
elements.adminCouponList.addEventListener("click", async (event) => {
  const button = event.target.closest('button[data-admin-action="toggle-coupon"]');
  if (!button) return;
  try {
    await apiRequest(`/api/admin/coupons/${encodeURIComponent(button.dataset.couponId)}`, {
      method: "PATCH",
      body: { active: button.dataset.active === "true" },
    });
    const result = await apiRequest("/api/admin/coupons");
    renderAdminCoupons(result.coupons);
  } catch (error) {
    console.error("Unable to update discount code.", error);
    elements.adminCouponStatus.textContent = error.message;
  }
});
elements.newsletterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.newsletterStatus.textContent = "Connecting…";
  try {
    await apiRequest("/api/newsletter", {
      method: "POST",
      body: {
        email: document.querySelector("#newsletter-email").value,
        consent: document.querySelector("#newsletter-consent").checked,
      },
    });
    elements.newsletterForm.reset();
    elements.newsletterStatus.textContent = "You're on the list. We'll be in touch.";
  } catch (error) {
    console.error("Unable to save newsletter subscription.", error);
    elements.newsletterStatus.textContent = error.message;
  }
});
document.querySelectorAll("[data-category-link]").forEach((link) => {
  link.addEventListener("click", () => {
    setCategory(link.dataset.categoryLink);
  });
});
const mobileMenuToggle = document.querySelector("#mobile-menu-toggle");
const primaryNavigation = document.querySelector("#primary-navigation");
mobileMenuToggle.addEventListener("click", () => {
  const isOpen = mobileMenuToggle.getAttribute("aria-expanded") === "true";
  mobileMenuToggle.setAttribute("aria-expanded", String(!isOpen));
  primaryNavigation.classList.toggle("is-open", !isOpen);
});
primaryNavigation.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    mobileMenuToggle.setAttribute("aria-expanded", "false");
    primaryNavigation.classList.remove("is-open");
  }
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    elements.productSearch.focus();
  }
});
window.addEventListener("popstate", () => {
  const match = window.location.pathname.match(/^\/products\/([^/]+)$/);
  if (match) openProduct(decodeURIComponent(match[1]), { updateUrl: false });
  else if (elements.productDialog.open) elements.productDialog.close();
});

initialize();
