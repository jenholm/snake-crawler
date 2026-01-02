# 🌉 Snake Crawler

**Aggregated news prioritized for you, by Enholm Heuristics.**

Snake Crawler is a modern, high-performance RSS and news aggregator built with **Next.js**, **TypeScript**, and **Tailwind CSS**. It features a bespoke "zeros and ones" bridge animation, robust image extraction, and a shuffled feed strategy to keep your news fresh.

## ✨ Features

-   **Bespoke Branding**: Custom "0s and 1s" Canvas bridge animation and bridge-themed UI elements.
-   **Robust Image Extraction**: Multi-stage strategy capturing `media:content`, `media:thumbnail`, `enc:enclosure`, and OpenGraph metadata.
-   **Intelligent Fallbacks**: Automatic feed discovery and HTML scraping for sites without standard RSS feeds.
-   **Responsive Design**: A sleek, card-based dashboard that looks great on mobile, tablet, and desktop.
-   **Dynamic Shuffle**: Shuffled article presentation ensuring you never see the same layout twice on refresh.
-   **Source Management**: Add new RSS feeds or site URLs directly from the dashboard.

## 🚀 Getting Started

### Prerequisites

-   **Node.js** (v18 or later)
-   **npm** or **pnpm** or **yarn**

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/jenholm/snake-crawler.git
    cd snake-crawler
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Running Locally

To start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the dashboard.

### Adding New Sites

You can add new sources by:
1.  Clicking the **"Add Site"** button in the header.
2.  Editing `src/data/sites.txt` to add permanent sources in the format `CATEGORY: URL`.

## 🛠️ Tech Stack

-   **Framework**: [Next.js](https://nextjs.org/) (App Router)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
-   **Icons**: [Lucide React](https://lucide.dev/)
-   **Parsing**: [rss-parser](https://github.com/rbren/rss-parser), [cheerio](https://cheerio.js.org/)

## 📜 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

*Made with ❤️ by Enholm Heuristics*
