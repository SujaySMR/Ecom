# Ecom Storefront

A responsive ecommerce storefront built with plain HTML and CSS.

## Features

- Store navigation and a free-shipping announcement
- Product-focused hero section and seasonal promotion
- Store benefits, statistics, product catalog, and customer testimonial
- Add products to a shopping cart, adjust quantities, remove items, and view the subtotal
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

This is a static frontend. The cart works in the current browser session, but checkout, account sign-in, and backend services are not implemented. Navigation links remain placeholders.
