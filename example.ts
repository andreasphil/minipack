import Minipack from "./main.ts";

const dependencies = new Minipack({ tempDir: "./.temp" }).gitHub({
  repo: "andreasphil/design-system",
  tag: "v0.37.0",
  use: ["*LICENSE*", "dist/*", "scripts/*"],
}).npm({
  package: "vue@3.4",
  use: ["*LICENSE*", "dist/vue.esm-browser.*"],
});

dependencies.pack();
