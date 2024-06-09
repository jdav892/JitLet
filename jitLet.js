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
//remove files that match path
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


}