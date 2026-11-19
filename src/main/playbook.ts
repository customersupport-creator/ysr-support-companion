import fs from "fs";
import path from "path";

export function loadPlaybookText(): string {
  const candidates = [
    path.join(process.resourcesPath, "ysr-reply-playbook.md"),
    path.join(__dirname, "../../resources/ysr-reply-playbook.md"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, "utf8");
  }
  throw new Error("The YSR reply playbook file is missing from the app.");
}
