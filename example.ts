import Minipack, { GitHub, Npm } from "./main.ts";

new Minipack().add(
  new GitHub({
    repo: "andreasphil/design-system",
    tag: "v0.37.0",
    use: ["*LICENSE*", "dist/*", "scripts/*"],
  }),
  new Npm({
    package: "vue@3.4",
    use: ["*LICENSE*", "dist/vue.esm-browser.*"],
  }),
).pack();
