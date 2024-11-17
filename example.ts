import Minipack, { GitHub, Npm } from "./main.ts";

const dependencies = new Minipack({ tempDir: "./vendor/temp", reload: true });

dependencies
  .add(
    new GitHub({
      repo: "andreasphil/design-system",
      tag: "v0.37.0",
      use: ["*LICENSE*", "dist/*", "scripts/*"],
    }),
  );

dependencies.add(
  new Npm({
    package: "vue@3.4",
    use: ["*LICENSE*", "dist/vue.esm-browser.*"],
  }),
);

dependencies.pack();
