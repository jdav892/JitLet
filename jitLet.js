#!/usr/bin/env node

let fs = require("fs");
let nodePath = require("path");
//initialize new repo
let jitlet = module.exports = {
    init: function(opts) {
        if(FileSystem.inRep()) {return;}
        opts = opts || {};

        let jitletStructure = {
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
        
        let addedFiles = files.lsRecursive(path);

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

        let filesToRm = index.matchingFiles(path);

        if(opts.f){
            throw new Error("unsupported")
        }else if(filesToRm.length === 0){
            throw new Error(files.pathFromRepoRoot(path) + " did not match any files");
        }else if(fs.existsSync(path) && fs.statSync(path).isDirectory() && !opts.r) {
            throw new Error("not removing " + path + " recursively without -r");
        }else{
            
            let changesToRm = util.intersection(diff.addedOrModifiedFiles(), filesToRm);
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
    }


}