# Endfield Tool — Production Calculator for “Arknights: Endfield”

[中文](./README_zh.md)

## What is this 🎮

Endfield Tool is a production‑planning and facility‑calculator web app for players of "Arknights: Endfield".  
It helps you plan and optimize resource production: building facilities, crafting items, managing recipes, and calculating required raw materials and production time.

## Features

- **Facility Management**: view and manage different production facilities.
- **Items & Recipes**: browse craftable items and their recipes.
- **Production Planning**: calculate raw materials and production chains for target items.
- **Intuitive UI**: interactive interface to adjust production quantities and automatically recalculate requirements.

## Install & Run

```bash
git clone https://github.com/JamboChen/endfield-tool.git
cd endfield-tool
pnpm install
pnpm dev
pnpm build
```

## Usage

1. Start the app.
2. Select target items to produce.
3. See required facilities, raw materials, and production time.
4. Adjust quantities to re‑calculate resources.

## Contributing

Contributions are welcome! Feel free to open issues or pull requests if you find bugs or have improvement suggestions.

## License

MIT

---

## Data Source & Disclaimer

- **Data Source**: All item, recipe, and facility data is sourced from [endfield.wiki.gg](https://endfield.wiki.gg).
- **No Guarantee of Accuracy**: I do **not** have official game-test access. The tool’s outputs are based solely on wiki data and should be considered **estimates only**.
  Use at your own discretion.
