import {
  buildDatasetIndex,
  DEFAULT_DATASETS_DIR,
} from "../dist/bots/dataset-index.js";

const dir = process.argv[2] || DEFAULT_DATASETS_DIR;
const db = process.argv[3] || "./data/datasets/.cache/retrieval.db";

console.log(`Индекс: ${db}`);
console.log(`Папка: ${dir}\n`);

const t0 = Date.now();
const result = await buildDatasetIndex(dir, db, {
  onProgress: ({ file, scanned, inserted }) => {
    console.log(`  ${file}: ${scanned} строк, ${inserted} пар`);
  },
});

console.log(
  `\nГотово за ${Math.round((Date.now() - t0) / 1000)}с: ${result.scanned} строк → ${result.inserted} пар`,
);
