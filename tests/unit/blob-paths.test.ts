import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deleteBlob, readBlob, uploadBlob } from "@/lib/blob";
const root = path.join(process.cwd(), ".local", "blob");
const prefix = "path-regression";
afterEach(async () => { await fs.rm(path.join(root, prefix), {recursive: true, force: true}); });
describe("local blob confinement", () => {
  it.each(["../outside.json", "../../package.json", "/tmp/outside.json", "folder\\..\\outside.json", ""])("rejects %s for reads, writes and deletes", async (name) => {
    await expect(readBlob(name)).rejects.toThrow();
    await expect(uploadBlob(name, "payload", "application/json")).rejects.toThrow();
    await expect(deleteBlob(name)).rejects.toThrow();
  });
  it("roundtrips valid nested paths", async () => {
    const name = `${prefix}/nested/example.json`;
    await uploadBlob(name, '{"ok":true}', "application/json");
    expect((await readBlob(name)).data.toString()).toBe('{"ok":true}');
    await deleteBlob(`/api/blob/${name}`);
    await expect(readBlob(name)).rejects.toThrow();
  });
  it("rejects symlink escapes without changing outside data", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "blob-outside-"));
    try {
      await fs.writeFile(path.join(outside, "secret.json"), "original");
      await fs.mkdir(path.join(root, prefix), {recursive:true});
      await fs.symlink(outside, path.join(root,prefix,"escape"));
      const name = `${prefix}/escape/secret.json`;
      await expect(readBlob(name)).rejects.toThrow(/symlink/);
      await expect(uploadBlob(name, "changed", "application/json")).rejects.toThrow(/symlink/);
      await expect(deleteBlob(name)).rejects.toThrow(/symlink/);
      expect(await fs.readFile(path.join(outside,"secret.json"),"utf8")).toBe("original");
    } finally { await fs.rm(outside,{recursive:true,force:true}); }
  });
});
