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
                throw new Error ("these files have changes:\n" + changesToRm.join("\n") + "\n");

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
                            "\ncannot commit because you have unmerged files\n")
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
            return Object.keys(refs.localHeads()).map((branch) => {
                return (branch === refs.headBranchName() ? "* " : " ") + branch;
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
            throw new Error(ref + " did not match any file(s) known to jitlet");
        }else if(objects.type(objects.read(toHash)) !== "commit") {
            throw new Error("reference is not a tree: " + ref);
        }else if(refs === refs.headBranchName() ||
                 refs === files.read(files.jitletPath("HEAD"))) {
        return "Already on " + ref;
         }else {
            const paths = diff.changedFilesCommitWouldOverwrite(toHash);
            if(paths.length > 0){
                throw new Error("local changes would be lost\n" + paths.join("\n") + "\n"); 
            }else{
                process.chdir(files.workingCopyPath());
                const isDetachingHead = object.exists(ref);
                workingCopy.write(diff.diff(refs.hash("HEAD"), toHash));
                refs.write("HEAD", isDetachingHead ? toHash : "ref:" + refs.toLocalRef(ref));
                index.write(index.tocToIndex(objects.commitToc(toHash)));
                return isDetachingHead ?
                 "Note: checking out " + toHash + "\nYou are in detached HEAD state." :
                 "Switched to branch" + ref;
            }
            
         }
    },

    diff: function(ref1, ref2, opts) {
// shows the change required to go from the ref1 commit to the ref2 commit
        files.assertInRepo();
        config.assertNotBare();

        if(ref1 !== undefined && refs.hash(ref1) === undefined) {
            throw new Error("ambiguous argument " + ref1 + ": unknown revision");
        }else if(ref2 !== undefined && refs.hash(ref2) === undefined){
            throw new Error("ambiguous argument " + ref2 + ": unknown revision");
        }else{
            const nameToStatus = diff.nameStatus(diff.diff(refs.hash(ref1), refs.hash(ref2)));
            return Object.keys(nameToStatus)
            .map(function(path) { return nameToStatus[path] + " " + path;})
        }

    },

    remote: function(command, name, path, _) {
// records the locations of remote versions of the repo
        files.assertInRepo();
        
        if(command !== "add"){
            throw new Error("unsupported");
        }else if(name in config.read()["remote"]){
            throw new Error("remote " + name + " already exists");

        }else{
            config.write(util.setIn(config.read(), ["remote", name, "url", path]));
            return "\n";
        }
    },

    fetch: function(remote, branch, _) {
        files.assertInRepo();
// records the commit that branch is at on remote, does not change the local branch
        if(remote === undefined || branch === undefined){
            throw new Error("unsupported")
        }else if(!(remote in config.read().remote)){
            throw new Error(remote + " does not appear to b ea jitlet repository");
        }else{
            const remoteUrl = config.read().remote[remote].url;
            const remoteRef = refs.toRemoteRef(remote, branch);
            const newHash = util.onRemote(remoteUrl)(refs.hash, branch);
            if(newHash === undefined){
                throw new Error("couldn't find remote ref " + branch);
            }else{
                const oldHash = refs.hash(remoteRef);
                const remoteObjects = util.onRemote(remoteUrl)(objects.allObjects);
                remoteObjects.forEach(objects.write);
                jitlet.update_ref(remoteRef, newHash);
                refs.write("FETCH_HEAD", newHash + " branch " + branch + " of " + remoteUrl);
                
                return ["From" + remoteUrl,
                    "Count " + remoteObjects.length,
                    branch + " -> " + remote + "/" + branch + 
                    (merge.isAForceFetch(oldHash, newHash) ? " (forced)" : "")].join("\n")
            }
        }
    },

    merge: function(ref, _) {
//finds the set of differences between the commit that the currently checked out branch is on and the commit that ref points to.
//finds or creates a commit that applies these differences to the checked out branch.
        files.assertInRepo();
        config.assertNotBare();

        const receiverHash = refs.hash("HEAD")
        const giverHash = refs.hash(ref);
        
        if(refs.isHeadDetached()){
            throw new Error("unsupported");
        }else if(giverHash === undefined || objects.type(objects.read(giverHash)) !== "commit"){
            throw new Error(ref + ": expected commit type");
        }else if(objects.isUpToDate(receiverHash, giverHash)) {
            return "Already up-to-date";
        }else{
            const paths = diff.changedFilesCommitWouldOverwrite(giverHash);
            if(paths.length > 0) {
                throw new Error("local changes would be lost\n" + paths.join("\n") + "\n");
            }else if(merge.canFastForward(receiverHash, giverHash)){
                merge.writeFastForwardMerge(receiverHash, giverHash);
                return "Fast-forward"
            }else{
                merge.writeNonFastForwardMerge(receiverHash, giverHas, ref);
                if(merge.hasConflicts(receiverHash, giverHash)) {
                    return "Automatic merge failed. Fix conflicts and commit the result.";
                }else{
                    return jitlet.commit()
                }
            }
        }
    },

    pull: function (remote, branch, _) {
// fetches the commit that branch is on at remote, merges that commit into the current branch
        files.assertInRepo();
        config.assertNotBare();
        jitlet.fetch(remote, branch);
        return jitlet.merge("FETCH_HEAD");
    },

    push: function (remote, branch, opts) {
//gets the commit that branch is on in the local repo and points branch on remote at the same commit
        files.assertInRepo();
        opts = opts || {};

        if(remote === undefined || branch === undefined) {
            throw new Error("unsupported")
        }else if(!(remote in config.read().remote)){
            throw new Error(remote + " does not appear to be a jitlet repository");
        }else{
            const remotePatch = config.read().remote[remote].url;
            const remoteCall = util.onRemote(remotePath);
            
            if(remoteCall(refs.isCheckedOut, branch)) {
                throw new Error("refusing to update checked out branch " + branch);
            }else{
                const receiverHash = remoteCall(refs.hash, branch);
                const giverHash = refs.hash(branch);

                if(objects.isUpToDate(receiverHash, giverHash)) {
                    return "Already up-to-date";
                }else if(!opts.f && !merge.canFastForward(receiverHash, giverHash)){
                    throw new Error("failed to push some refs to " + remotePath);
                }else{
                    objects.allObjects().forEach(function(o){remoteCall(objects.write, o); });
                    remoteCall(jitlet.update_ref, refs.toLocalRef(branch), giverHash);
                    jitlet.update_ref(refs.toRemoteRef(remote, branch), giverHash);
                    return ["To " + remotePath,
                            "Count " + objects.allObjects().length,
                            branch + " -> " + branch].join("\n") + "\n";
                }
            }
        }
    },

    status: function(_){
//reports the state of the repo: the current branch, untracked files, conflicted files,
//files that are staged to be committed and files that are not staged to be committed
        files.assertInRepo();
        config.assertNotBare();
        return this.status.toString();
    },

    clone: function(remotePath, targetPath, opts) {
// copies the repository at remotePath to targetPath
        opts = opts || {};
        if(remotePath === undefined || targetPath == undefined) {
            throw new Error("you must specify remote path and target path");
        }else if(!fs.existsSync(remotePath) || !util.onRemote(remotePath)(files.inRepo)){
            throw new Error("repository " + remotePath + " does not exist");
        }else if(fs.existsSync(targetPath) && fs.readdirSync(targetPath).length > 0){
            throw new Error(targetPath + " already exists and is not empty");
        }else{
            remotePath = nodePath.resolve(process.cwd(), remotePath);
            if(!fs.existsSync(targetPath)){
                fs.mkdirSync(targetPath);
            }
            util.onRemote(targetPath)(function(){
                jitlet.init(opts);
                jitlet.remote("add", "origin", nodePath.relative(process.cwd(), remotePath));
                const remoteHeadHash = util.onRemote(remotePath)(refs.hash, "master");
                
                if(remoteHeadHash !== undefined){
                    jitlet.fetch("origin", "main");
                    merge.writeFastForwardMerge(undefined, remoteHeadHash);
                }
            });

            return "Cloning into " + targetPath;
        }
    }, 

    update_index: function(path, opts){
// adds the contents of the file at path to the index or removes the file from the index
        files.assertInRepo();
        config.assertNotBare();
        opts = opts || {};

        const pathFromRoot = files.pathFromRepoRoot(path);
        const isOnDisk = fs.existsSync(path);
        const isInIndex = index.hasFile(path, 0);

        if(isOnDisk && fs.statSync(path).isDirectory()){
            throw new Error(pathFromRoot + " is a directory -add files inside\n");
        }else if(opts.remove && !isOnDisk && isInIndex){
            if(index.isFileInConflict(path)){
                throw new Error("unsupported")
            }else{
                index.writeRm(path);
                return "\n";
            }
        }
        else if(opts.remove && !isOnDisk && !isInIndex){
            return "\n";
        }else if(!opts.add && isOnDisk && !isInIndex){
            throw new Error("cannot add " + pathFromRoot + " to index - use --add option\n");
        }else if(isOnDisk && (opts.add || isInIndex)) {
            index.writeNonConflict(path, files.read(files.workingCopyPath(path)));
            return "\n";
        }else if(!opts.remove && !isOnDisk){
            throw new Error(pathFromRoot + " does not exist and --remove not passed\n")
        }
    },

    write_tree: function(_){
// takes the content of the index and stores a tree object that represents that content to the objects directory
        files.assertInRepo();
        return objects.writeTree(files.nestFlatTree(index.toc()));
    },

    update_ref: function(refToUpdate, refToUpdateTo, _) {
//gets the hash of the commit that refToUpdateTo points at and sets refToUpdate to point at the same hash
        files.assertInRepo();

        const hash = refs.hash(refToUpdateTo);

        if(!objects.exists(hash)){
            throw new Error(refToUpdateTo + " not a valid SHA1(Secure Hash Algorithm 1)");
        }else if(!refs.isRef(refToUpdate)){
            throw new Error("cannot lock the ref " + refToUpdate);
        }else if(objects.type(objects.read(hash)) !== "commit"){
            const branch = refs.terminalRef(refToUpdate);
            throw new Error(branch + " cannot refer to non-commit object " + hash + "\n");
        }else{
            refs.write(refs.terminalRef(refToUpdate), hash);
        }
    }
};
// refs are names for commit hashes. The ref is the name of a file, some refs represent local branches, some represent remote branches, some represent important states of the repo
const refs = {

    isRef: function(ref) {
// returns true if ref matches valid qualified ref syntax. 
        return ref !== undefined &&
         (ref.match("^refs/heads/[A-Za-z-]+$") ||
          ref.match("^refs/remotes/[A-Za-z-]+/[A-Za-z-]+$") ||
          ["HEAD", "FETCH_HEAD", "MERGE_HEAD"].indexOf(ref) !== -1)
    },

    terminalRef: function(ref){
// resolves ref to the most specific ref possible
        if(ref === "HEAD" && !refs.isHeadDetached()) {
            return files.read(files.jitletPath("HEAD")).match("ref: (refs/heads/.+)")[1];
        }else if(refs.isRef(ref)){
            return ref;
        }else{
            return refs.toLocalRef(ref);
        }
    },

    hash: function(refOrHash){
// returns the has that refOrHash points to
        if(objects.exists(refOrHash)){
            return refOrHash;
        }else{
            const terminalRef = refs.terminalRef(refOrHash);
            if(terminalRef === "FETCH_HEAD"){
                return refs.fetchHeadBranchToMerge(refs.headBranchName());
            }else if(refs.exists(terminalRef)){
                return files.read(files.jitletPath(terminalRef))
            }
        }
    },
    
    isHeadDetached: function(){
// returns true if HEAD contains a commit hash rather than a branch ref
        return files.read(files.jitletPath("HEAD")).match("refs") == null;
    },

    isCheckedOut: function(){
// returns true if the repo is not bare and HEAD is pointing at the branch called branch
        return !config.isBare() && refs.headBranchName() === branch;
    },

    toLocalRef: function(name) {
// converts the branch name into a qualified local branch
        return "refs/heads/" + name;
    },

    toRemoteRef: function(remote, name){
// converts remote and branch name (name) into a qualified remote branch
        return "refs/remotes/" + remote + "/" + name;
    },

    write: function(ref, content){
// sets the content of the file for the qualified ref (ref to content)
        if(refs.isRef(ref)){
            files.write(files.jitletPath(nodePath.normalize(ref)), content);
        }
    },

    rm: function(ref){
// removes the file for the qualified ref (ref)
        if(refs.isRef(ref)) {
            fs.unlinkSync(files.jitletPath(ref));
        }
    },

    fetchHeadBranchToMerge: function(branchName){
// reads the FETCH_HEAD file and gets the hash that the remote branchName is pointing at
        return util.lines(files.read(files.jitletPath("FETCH_HEAD")))
        .filter(function(l) {return l.match("^.+ branch " + branchName + " of"); })
        .map(function(l){ return l.match("^.[^ ]+)") [1];})[0];
    },

    localHeads: function(){
// returns a JS object that maps local branch names to the hash of the commit they point to 
        return fs.readdirSync(nodePath.join(files.jitletPath(), "refs", "heads"))
        .reduce(function(o, n) {return util.setIn(o, [n, refs.hash(n)]);}, {});
    },

    exists: function(ref){
// returns true if the qualified ref exists.
        return refs.isRef(ref) && fs.existsSync(files.jitletPath(ref));
    },

    headBranchName: function() {
// returns the name of the branch that HEAD is pointing at
        if(!refs.isHeadDetached()){
            return files.read(files.jitletPath("HEAD")).match("refs/heads/(.+)")[1];
        }
    },

    commitParentHashes: function(){
        const headHash = refs.hash("HEAD");

        if(merge.isMergeInProgress()){
            return[headHash, refs.hash("MERGE_HEAD")];
        }else if(headHash === undefined){
            return [];
        }else{
            return [headHash];
        }
    }
};

const objects = {
// objects are files in the .jitlet/objects directory.
// a blob objects stores the content of a file
// a tree object stores a list of files and directories in a directory in the repository
// a commit object stores a pointer to a tree object and a message
    writeTree: function(tree){
        const treeObject = Object.keys(tree).map(function(key){
            if(util.isString(tree[key])){
                return "blob" + tree[key] + " " + key;
            }else{
                return "tree " + objects.writeTree(tree[key]) + " " + key;
            }
        }).join("\n") + "\n"
        return objects.write(treeObject);
    },

    

}
