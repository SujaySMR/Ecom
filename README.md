# Ecom Storefront

A responsive ecommerce storefront built with plain HTML and CSS.

## Features

- Store navigation and a free-shipping announcement
- Product-focused hero section and seasonal promotion
- Store benefits, statistics, product catalog, and customer testimonial
<<<<<<< HEAD
- Shopping cart with quantity controls and item removal
- Checkout summary with an estimated tax and order total
=======
- Add products to a shopping cart, adjust quantities, remove items, and view the subtotal
>>>>>>> feature/login
- Responsive layouts for desktop and mobile screens

## Project Structure

- `index.html` - storefront markup
- `style.css` - layout, components, and responsive styles
- `assets/` and `img/` - project image assets
- `info/` - notes and supporting files
- `builds/` - build information and output

## Run Locally

Open `index.html` directly in a browser, or start a local server from the project directory:

```powershell
python -m http.server 8000
```

Visit `http://localhost:8000`.

## Current Limitations

<<<<<<< HEAD
This is a static frontend. The cart and checkout summary work in the current page session. Tax uses an illustrative 8% rate and is not calculated for a delivery address. The payment action is a demo only; no payment is processed. Connect a tax service and payment provider before using this for real orders. Account sign-in and navigation links are also placeholders.
=======
This is a static frontend. The cart works in the current browser session, but checkout, account sign-in, and backend services are not implemented. Navigation links remain placeholders.
>>>>>>> feature/login
