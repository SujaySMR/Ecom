// Read-only catalog API for the standalone file:// storefront preview.
const previewProducts = [
  {
    id: "minimal-lamp",
    slug: "minimal-lamp",
    name: "Minimal Lamp",
    category: "lighting",
    material: "Brushed brass",
    description: "A sculptural table lamp with a warm, diffused glow for slow evenings.",
    specifications: { Finish: "Brushed brass", Bulb: "E14 LED", Dimensions: "28 × 16 cm" },
    images: [],
    imageTheme: "product-one",
    priceCents: 4900,
    stockQuantity: 40,
    availableQuantity: 40,
    inStock: true,
    featuredRank: 1,
  },
  {
    id: "leather-chair",
    slug: "leather-chair",
    name: "Leather Chair",
    category: "furniture",
    material: "Forest green leather",
    description: "A low-profile lounge chair built around a solid frame and considered comfort.",
    specifications: {
      Frame: "Solid ash",
      Upholstery: "Forest green leather",
      Dimensions: "76 × 82 × 74 cm",
    },
    images: [],
    imageTheme: "product-two",
    priceCents: 12900,
    stockQuantity: 12,
    availableQuantity: 12,
    inStock: true,
    featuredRank: 2,
  },
  {
    id: "soft-throw",
    slug: "soft-throw",
    name: "Soft Throw",
    category: "textiles",
    material: "Handwoven cotton",
    description: "A breathable, tactile layer for the sofa, reading chair, or end of the bed.",
    specifications: { Material: "100% cotton", Weave: "Handwoven", Dimensions: "130 × 180 cm" },
    images: [],
    imageTheme: "product-three",
    priceCents: 3500,
    stockQuantity: 55,
    availableQuantity: 55,
    inStock: true,
    featuredRank: 3,
  },
  {
    id: "wood-table",
    slug: "wood-table",
    name: "Wood Table",
    category: "furniture",
    material: "Solid oak",
    description: "A compact side table with a softly finished top and honest oak grain.",
    specifications: { Material: "Solid oak", Finish: "Natural oil", Dimensions: "48 × 48 × 52 cm" },
    images: [],
    imageTheme: "product-four",
    priceCents: 19900,
    stockQuantity: 8,
    availableQuantity: 8,
    inStock: true,
    featuredRank: 4,
  },
  {
    id: "ceramic-vase",
    slug: "ceramic-vase",
    name: "Sculpted Ceramic Vase",
    category: "decor",
    material: "Matte stoneware",
    description: "A hand-finished vessel with a quiet silhouette, made to stand alone or hold a single stem.",
    specifications: { Material: "Stoneware", Finish: "Matte chalk", Dimensions: "24 × 14 cm" },
    images: [],
    imageTheme: "product-five",
    priceCents: 4200,
    stockQuantity: 24,
    availableQuantity: 24,
    inStock: true,
    featuredRank: 5,
  },
  {
    id: "arc-floor-lamp",
    slug: "arc-floor-lamp",
    name: "Arc Floor Lamp",
    category: "lighting",
    material: "Powder-coated steel",
    description: "An architectural reading light with a sweeping arm and a softly focused shade.",
    specifications: {
      Material: "Powder-coated steel",
      Bulb: "E27 LED",
      Dimensions: "165 × 42 cm",
    },
    images: [],
    imageTheme: "product-six",
    priceCents: 17900,
    stockQuantity: 9,
    availableQuantity: 9,
    inStock: true,
    featuredRank: 6,
  },
  {
    id: "wool-cushion",
    slug: "wool-cushion",
    name: "Wool Cushion",
    category: "textiles",
    material: "Recycled wool blend",
    description: "A richly textured cushion cover in a warm neutral weave, finished with a hidden zip.",
    specifications: { Material: "70% recycled wool", Care: "Dry clean", Dimensions: "45 × 45 cm" },
    images: [],
    imageTheme: "product-seven",
    priceCents: 5800,
    stockQuantity: 30,
    availableQuantity: 30,
    inStock: true,
    featuredRank: 7,
  },
  {
    id: "modular-shelf",
    slug: "modular-shelf",
    name: "Modular Shelf",
    category: "furniture",
    material: "FSC-certified oak",
    description: "A wall-mounted shelf designed to grow with your space, one considered module at a time.",
    specifications: {
      Material: "FSC-certified oak",
      Mounting: "Wall-mounted",
      Dimensions: "80 × 22 × 30 cm",
    },
    images: [],
    imageTheme: "product-eight",
    priceCents: 24900,
    stockQuantity: 6,
    availableQuantity: 6,
    inStock: true,
    featuredRank: 8,
  },
];

function copyPreviewProduct(product) {
  return {
    ...product,
    images: [...product.images],
    specifications: { ...product.specifications },
  };
}

function getPreviewCategories() {
  const counts = new Map();
  for (const product of previewProducts) {
    counts.set(product.category, (counts.get(product.category) || 0) + 1);
  }
  return [...counts]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([category, product_count]) => ({ category, product_count }));
}

function getPreviewProducts(url) {
  const query = url.searchParams;
  const search = (query.get("q") || "").trim().toLocaleLowerCase();
  const category = query.get("category") || "all";
  const minimumPrice = query.has("minPrice") ? Number(query.get("minPrice")) : null;
  const maximumPrice = query.has("maxPrice") ? Number(query.get("maxPrice")) : null;
  const inStockOnly = query.get("inStock") === "true";
  const page = Number(query.get("page") || 1);
  const pageSize = Number(query.get("pageSize") || 8);
  const sort = query.get("sort") || "featured";

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 24 ||
    (minimumPrice !== null && (!Number.isSafeInteger(minimumPrice) || minimumPrice < 0)) ||
    (maximumPrice !== null && (!Number.isSafeInteger(maximumPrice) || maximumPrice < 0)) ||
    (minimumPrice !== null && maximumPrice !== null && minimumPrice > maximumPrice)
  ) {
    throw new Error("Choose valid catalog filters.");
  }
  if (!["featured", "price-ascending", "price-descending", "name", "newest"].includes(sort)) {
    throw new Error("Choose a valid sort order.");
  }

  const filtered = previewProducts.filter((product) => {
    const searchableText = `${product.name} ${product.material} ${product.description}`.toLocaleLowerCase();
    return (
      (!search || searchableText.includes(search)) &&
      (category === "all" || product.category === category) &&
      (minimumPrice === null || product.priceCents >= minimumPrice) &&
      (maximumPrice === null || product.priceCents <= maximumPrice) &&
      (!inStockOnly || product.inStock)
    );
  });

  if (sort === "price-ascending") {
    filtered.sort((first, second) => first.priceCents - second.priceCents || first.id.localeCompare(second.id));
  } else if (sort === "price-descending") {
    filtered.sort((first, second) => second.priceCents - first.priceCents || first.id.localeCompare(second.id));
  } else if (sort === "name") {
    filtered.sort((first, second) => first.name.localeCompare(second.name) || first.id.localeCompare(second.id));
  } else {
    filtered.sort((first, second) => first.featuredRank - second.featuredRank);
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const items = filtered
    .slice((page - 1) * pageSize, page * pageSize)
    .map(copyPreviewProduct);

  return {
    items,
    pagination: { page, pageSize, total, totalPages },
  };
}

const formaCatalogPreview = {
  async request(path, options = {}) {
    const url = new URL(path, "file:///index.html");
    const method = (options.method || "GET").toUpperCase();
    if (method !== "GET") {
      throw new Error(
        "This file preview is read-only. Run the app with PostgreSQL to use accounts, checkout, admin, and newsletter features.",
      );
    }

    if (url.pathname === "/api/config") {
      return {
        checkoutAvailable: false,
        accountsAvailable: false,
        catalogApiAvailable: true,
        localPreview: true,
      };
    }
    if (url.pathname === "/api/auth/session") return { user: null };
    if (url.pathname === "/api/products/categories") {
      return { categories: getPreviewCategories() };
    }
    if (url.pathname === "/api/products") return getPreviewProducts(url);

    const productPath = "/api/products/";
    if (url.pathname.startsWith(productPath)) {
      let identifier;
      try {
        identifier = decodeURIComponent(url.pathname.slice(productPath.length));
      } catch {
        throw new Error("This piece could not be found.");
      }
      const product = previewProducts.find(
        (item) => item.id === identifier || item.slug === identifier,
      );
      if (!product) throw new Error("This piece could not be found.");
      return { product: copyPreviewProduct(product) };
    }

    throw new Error(
      "This local preview is read-only. Run npm start with PostgreSQL to enable this feature.",
    );
  },
};

if (typeof window !== "undefined") {
  window.formaCatalogPreview = formaCatalogPreview;
}

if (typeof module !== "undefined") {
  module.exports = formaCatalogPreview;
}
