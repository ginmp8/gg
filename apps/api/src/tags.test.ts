import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createProject, createRepositoryRecord, listProjectTags, openGitaDatabase,
  replacePullRequests, storeRepositoryAnalysis
} from "@gita/db";
import { buildServer } from "./server";

function commit(hash: string, email: string) {
  return {
    hash, shortHash: hash.slice(0, 7), authorName: "Ada", authorEmail: email,
    authorDate: "2026-03-01T12:00:00Z", committerName: "Ada", committerEmail: email,
    committerDate: "2026-03-01T12:00:00Z", subject: "Feature", body: "", parents: [],
    isMerge: false, insertions: 1, deletions: 0, filesChanged: 1
  };
}
function analysis(hash: string, email: string) {
  return {
    defaultBranch: "main",
    commits: [commit(hash,email)],
    commitBranches: [{commitHash: hash, branchName:"main", remote:null}],
    fileStats: [], files: [],
    branches: [{
      name: "main", remote:null, isDefault:true, headCommitHash: hash,
      lastCommitAt:"2026-03-01T12:00:00Z",createdAtEstimate:null,
      providerCreatedAt:null,branchTimeSource:"headCommit" as const,
      updatedAt:"2026-03-01T12:00:00Z"
    }]
  };
}
function pr(repoId: string, number: number) {
  return {
    repoId, provider:"github" as const, providerId:"PR_" + number,
    number, title:"Fix feature " + number, state:"merged" as const,
    authorLogin:"ada", createdAt:"2026-03-01T12:00:00Z", updatedAt:"2026-03-02T12:00:00Z",
    closedAt:"2026-03-02T12:00:00Z",mergedAt:"2026-03-02T12:00:00Z",
    baseBranch:"main",headBranch:"fix/test",additions:2,deletions:1,changedFiles:1,
    reviewDecision:"APPROVED",url:"https://github.com/example/repo/pull/" + number
  };
}

describe("project-scoped flexible tagging and multi-repo inventories", () => {
  it("preserves free-form labels, rejects foreign entities, supports four targets and cascades", async () => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"gita-tags-"));
    const db=openGitaDatabase(root);const server=await buildServer(db);
    try {
      const p=await createProject(db,{name:"One"}),other=await createProject(db,{name:"Other"});
      const repo=await createRepositoryRecord(db,p.id,{
        name:"Repo One",provider:"local",fetchUrl:"/tmp/one",localPath:"/tmp/one",githubOwnerRepo:null
      });
      const foreign=await createRepositoryRecord(db,other.id,{
        name:"Repo Other",provider:"local",fetchUrl:"/tmp/two",localPath:"/tmp/two",githubOwnerRepo:null
      });
      expect(listProjectTags(db,p.id)).toEqual({items:[],assignments:[]});
      storeRepositoryAnalysis(db,repo,analysis("a".repeat(40),"Ada@EXAMPLE.test"));
      replacePullRequests(db,repo.id,[pr(repo.id,7)]);
      const rootUrl="/api/projects/"+p.id+"/tags";
      const created=await server.inject({method:"POST",url:rootUrl,payload:{group:"My own team",name:"API guild"}});
      expect(created.statusCode,created.body).toBe(201);
      const tag=created.json();
      expect(tag).toMatchObject({group:"My own team",name:"API guild"});
      const duplicate=await server.inject({method:"POST",url:rootUrl,
        payload:{group:"my own team",name:"api guild"}});
      expect(duplicate.statusCode).toBe(409);
      const control=await server.inject({method:"POST",url:rootUrl,
        payload:{group:"",name:"bad"+String.fromCharCode(0)+"tag"}});
      expect(control.statusCode).toBe(400);
      const assignUrl=rootUrl+"/"+tag.id+"/assignments";
      for (const [type,key] of [
        ["contributor","ADA@EXAMPLE.test"],["repository",repo.id],
        ["branch",repo.id+":main"],["pull_request",repo.id+":PR_7"]
      ]) {
        const response=await server.inject({method:"POST",url:assignUrl,
          payload:{targetType:type,targetKey:key}});
        expect(response.statusCode,response.body).toBe(204);
      }
      expect(listProjectTags(db,p.id).assignments).toHaveLength(4);
      expect(listProjectTags(db,p.id).assignments.some(a =>
        a.targetType==="contributor" && a.targetKey==="ada@example.test")).toBe(true);
      const rejected=await server.inject({method:"POST",url:assignUrl,
        payload:{targetType:"repository",targetKey:foreign.id}});
      expect(rejected.statusCode).toBe(422);
      const invalid=await server.inject({method:"POST",url:assignUrl,
        payload:{targetType:"contributor",targetKey:"missing@example.test"}});
      expect(invalid.statusCode).toBe(422);
      const targetPage=await server.inject({method:"GET",
        url:"/api/projects/"+p.id+"/tag-targets?type=contributor&search=ada"});
      expect(targetPage.json().items).toMatchObject([{key:"ada@example.test",type:"contributor"}]);
      const updated=await server.inject({method:"PATCH",url:rootUrl+"/"+tag.id,
        payload:{group:"Department",name:"Core Engineers"}});
      expect(updated.json()).toMatchObject({name:"Core Engineers",group:"Department"});
      expect((await server.inject({method:"DELETE",url:assignUrl,
        payload:{targetType:"repository",targetKey:repo.id}})).statusCode).toBe(204);
      expect(listProjectTags(db,p.id).assignments).toHaveLength(3);
      expect((await server.inject({method:"DELETE",
        url:"/api/projects/"+other.id+"/tags/"+tag.id})).statusCode).toBe(404);
      db.sqlite.prepare("DELETE FROM projects WHERE id=?").run(p.id);
      expect(listProjectTags(db,p.id).items).toHaveLength(0);
      expect((db.sqlite.prepare("SELECT COUNT(*) AS n FROM project_tag_assignments").get() as {n:number}).n).toBe(0);
    } finally {
      await server.close();db.sqlite.close();fs.rmSync(root,{recursive:true,force:true});
    }
  });

  it("lists branches and PRs across repositories with correct names and pagination", async () => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"gita-multi-repo-"));
    const db=openGitaDatabase(root);const server=await buildServer(db);
    try {
      const project=await createProject(db,{name:"Project"});
      const repoA=await createRepositoryRecord(db,project.id,{
        name:"Alpha",provider:"local",fetchUrl:"/tmp/alpha",localPath:"/tmp/alpha",githubOwnerRepo:null
      });
      const repoB=await createRepositoryRecord(db,project.id,{
        name:"Beta",provider:"local",fetchUrl:"/tmp/beta",localPath:"/tmp/beta",githubOwnerRepo:null
      });
      storeRepositoryAnalysis(db,repoA,analysis("a".repeat(40),"ada@example.test"));
      storeRepositoryAnalysis(db,repoB,analysis("b".repeat(40),"bob@example.test"));
      replacePullRequests(db,repoA.id,[pr(repoA.id,1)]);
      replacePullRequests(db,repoB.id,[pr(repoB.id,2)]);
      const url="/api/projects/"+project.id;
      const branches=await server.inject({method:"GET",url:url+"/branches?limit=1&offset=0"});
      expect(branches.statusCode).toBe(200);
      expect(branches.json()).toMatchObject({total:2,items:[{repositoryName:"Alpha",name:"main"}]});
      const next=await server.inject({method:"GET",url:url+"/branches?limit=1&offset=1"});
      expect(next.json().items).toMatchObject([{repositoryName:"Beta",name:"main"}]);
      const prs=await server.inject({method:"GET",url:url+"/pull-requests?limit=10"});
      expect(prs.statusCode,prs.body).toBe(200);
      expect(prs.json().total).toBe(2);
      expect(prs.json().items.map((row:{repositoryName:string})=>row.repositoryName).sort())
        .toEqual(["Alpha","Beta"]);
      expect((await server.inject({method:"GET",url:"/api/projects/missing/branches"})).statusCode).toBe(404);
    } finally {
      await server.close();db.sqlite.close();fs.rmSync(root,{recursive:true,force:true});
    }
  });
});
