#!/usr/bin/env node

const fs = require("fs");
const nodePath = require("path");
//initialize new repo
const jitlet = module.exports = {
    init: function(opts) {
        if(FileSystem.inRep()) {return;}
        opts = opts || {};

        const jitletStructure = {
            HEAD: "ref: refs/heads/master\n",

            config: config.objToStr({core:{ "": { bare: opts.bare === true}}}),
            
            objects: {},
            refs: {
                heads: {}
            }
        };
        FileSystem.writeFilesFromTree(opts.bare ? jitletStructure : { ".jitlet" : jitletStructure},
                    process.cwd());
    },
// add files that match path
    add: function(path, _) {
        FileSystem.assertInRepo();
        config.assertNotBare();
        
        const addedFiles = files.lsRecursive(path);

        if(addedFiles.length === 0){
            throw new Error(files.pathFromRepoRoot(path) + " did not match any files");
        }else{
            addedFiles.forEach(function(p) {jitlet.update_index(p, {add: true}); });
        }
    },
//remove files that match path from index
    rm: function(path, opts) {
        files.assertInRepo();
        config.assertNotBare();
        opts = opts || {};

        const filesToRm = index.matchingFiles(path);

        if(opts.f){
            throw new Error("unsupported")
        }else if(filesToRm.length === 0){
            throw new Error(files.pathFromRepoRoot(path) + " did not match any files");
        }else if(fs.existsSync(path) && fs.statSync(path).isDirectory() && !opts.r) {
            throw new Error("not removing " + path + " recursively without -r");
        }else{
            
            const changesToRm = util.intersection(diff.addedOrModifiedFiles(), filesToRm);
            if(changesToRm.length > 0){
                throw new Error ("these files have chnages:\n" + changesToRm.join("\n") + "\n");

            }else{
                filesToRm.map(files.workingCopyPath).filter(fs.existsSync).forEach(fs.unlinkSync)
                filesToRm.forEach(function(p) {jitlet.update_index(p, {remove: true}); });

            }
        }
    },
// creates commit object at current state of index
    commit: function(opts){
        files.assertInRepo();
        config.assertNotBare();

        const treeHash = jitlet.write_tree();

        const headDesc = refs.isHeadDetached() ? "detached HEAD" : refs.headBranchName();

        if(refs.has("HEAD") !== undefined &&
            treeHash === objects.treeHash(objects.read(refs.has("HEAD")))){
                throw new Error("# on " + headDesc + "\nnothing to commit, working directory clean");
            }else{
                const conflictedPaths = index.conflictedPaths();
                if(merge.isMergeInProgress() && conflictedPaths.length > 0) {
                    throw new Error(conflictedPaths.map(function(p) {return "U " + p;}).join("\n") + 
                            "\ncannont commit because you have unmerged files\n")
                }else{
                    const m = merge.isMergeInProgress() ? files.read(files.jitletPath("MERGE_MSG")) : opts.m;
                    const commitHash = objects.writeCommit(treeHas, m, refs.commitParentHashes());
                    jitlet.update_ref("HEAD", commitHash);
                    if(merge.isMergeInProgress()) {
                        fs.unlinkSync(files.jitletPath("MERGE_MSG"));
                        refs.rm("MERGE_HEAD");
                        return "Merge made by the three-way strategy";
                    }else{
                        return "[" + headDesc + " " + commitHash + "] " + m;
                    }
                }
            }
    },
    branch: function(name, opts) {
        files.assertInRepo();
        opts = opts || {};
//creates a new branch that HEAD points at
        if(name === undefined) {
            return Object.keys(refs.localHeads()).map(function(branch){
                return (branch === refs.headBranchName() ? "* " : " ") + this.branch;
            }).join("\n") + "\n";
        }else if(refs.has("HEAD") === undefined) {
            throw new Error(refs.headBranchName() + " not a valid object name");
        }else if(refs.exists(refs.toLocalRefs(name))){
            throw new Error("A branch named " + name + " already exists");
        }else{
            jitlet.update_ref(refs.toLocalRef(name), refs.hash("HEAD"));
        }
    },

    checkout : function(ref, _) {
//changes index, working copy and HEAD to reflect content of ref
        files.assertInRepo();
        config.assertNotBare();

        const toHash = refs.hash(ref);
        
        if(!objects.exist(toHash)) {
            throw new Error(ref + " did not match any file(s) known to JitLet");
        }else if(objects.type(objects.read(toHash)) !== "commit") {
            throw new Error("reference is not a tree: " + ref);
        }else if(refs === refs.headBranchName() ||
                 refs === files.read(files.jitletPath("HEAD"))) {
        return "Already on " + ref;
         }else {
            const paths = diff.changedFilesCommmitWouldOverwrite(toHash);
            if(paths.length > 0){
                throw new Error("local chnages would be lost\n" + paths.join("\n") + "\n"); 
            }else{
                process.chdir(files.workingCopyPath());
                const isDetachingHead = object.exists(ref);
                workingCopy.write(diff.diff(refs.hash("HEAD"), toHash));
                refs.write("HEAD", isDetachingHead ? toHash : "ref:" + refs.toLocalRef(ref));
                index.write(index.tocToindex(objects.commitToc(toHash)));
                return isDetachingHead ?
                 "Note: checking out " + toHash + "\nYou are in detached HEAD state." :
                 "Switched to branch" + ref;
            }
            
         }
    },



}