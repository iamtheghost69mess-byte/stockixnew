import type { Metadata } from "next";

import { RecipesEditor } from "./_components/recipes-editor";

export const metadata: Metadata = {
  title: "Recipes",
  description: "Bill of materials (BOM) per menu item",
};

export default function RecipesPage() {
  return <RecipesEditor />;
}
