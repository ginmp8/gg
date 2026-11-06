import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { openGGDatabase, openGGDatabaseReadOnly } from "./client";
import { executeGGCli, parseGGCliArgs, RAW_TABLES } from "./cli";
import { createProject, createRepositoryRecord } from "./queries";

describe("local read-only JSON CLI", () => {
  it("does not create a database and cannot execute writes or arbitrary table identifiers", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),"gg-cli-test-"));
    try {
      expect(() => openGGDatabaseReadOnly(root)).toThrow(/No existing GG database/);
      expect(fs.existsSync(path.join(root,".gg"))).toBe(false);
      const write = openGGDatabase(root);
      const project = await createProject(write,{name:"CLI project"});
      const other = await createProject(write,{name:"Other project"});
      const repo = await createRepositoryRecord(write,project.id,{
        name:"Local",provider:"local",fetchUrl:"/tmp/local",localPath:"/tmp/local",githubOwnerRepo:null
      });
      const foreign = await createRepositoryRecord(write,other.id,{
        name:"Foreign",provider:"local",fetchUrl:"/tmp/foreign",localPath:"/tmp/foreign",githubOwnerRepo:null
      });
      write.sqlite.close();
      const db = openGGDatabaseReadOnly(root);
      try {
        expect(() => db.sqlite.prepare("INSERT INTO projects (id,name,created_at,updated_at) VALUES (?,?,?,?)")
          .run("bad","Bad","2026","2026")).toThrow();
        const projects = await executeGGCli(db,["projects"]);
        expect(projects).toMatchObject({
          readOnly:true,source:"local-sqlite",command:"projects",
          data:{items:expect.arrayContaining([expect.objectContaining({id:project.id})])}
        });
        const summary = await executeGGCli(db,["summary","--project",project.id]);
        expect(summary).toMatchObject({command:"summary",data:{repositories:1,commits:0}});
        const repos = await executeGGCli(db,["repositories","--project",project.id]);
        expect(repos).toMatchObject({data:{items:[expect.objectContaining({id:repo.id})]}});
        const annual = await executeGGCli(db,["annual","--project",project.id,"--year","2026"]);
        expect(annual).toMatchObject({command:"annual",data:{complete:false,year:2026}});
        const scores = await executeGGCli(db,["scores","--project",project.id,"--year","2026"]);
        expect(scores).toMatchObject({data:{complete:false,methodology:"ICE-Git/1"}});
        const raw = await executeGGCli(db,["table","--table","projects","--limit","1","--offset","1"]);
        expect(raw).toMatchObject({data:{table:"projects",total:2,limit:1,offset:1}});
        const tags = await executeGGCli(db,["tags","--project",project.id]);
        expect(tags).toMatchObject({data:{items:[],assignments:[]}});
        expect(RAW_TABLES).toContain("annual_file_changes");
        await expect(executeGGCli(db,["table","--table","projects;DROP TABLE projects;"])).rejects.toThrow(/Unknown raw table/);
        await expect(executeGGCli(db,["contributors","--project",project.id,"--repo",foreign.id])).rejects
          .toThrow(/does not belong/);
        await expect(executeGGCli(db,["scores","--project",project.id,"--year","2026.5"])).rejects
          .toThrow(/decimal integer/);
        await expect(executeGGCli(db,["table","--table","commits","--limit","0"])).rejects
          .toThrow(/between/);
        expect(() => parseGGCliArgs(["projects","--table","commits"])).toThrow(/not supported/);
      } finally { db.sqlite.close(); }
    } finally { fs.rmSync(root,{recursive:true,force:true}); }
  });
});
