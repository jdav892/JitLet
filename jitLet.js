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
            throw new Error(remote + " does not appear to be a jitlet repository");
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
                    jitlet.fetch("origin", "master");
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
// returns the array of the commits that would be the parents of the next commit
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
// stores a graph of tree objects that represent the content currently in the index
        const treeObject = Object.keys(tree).map(function(key){
            if(util.isString(tree[key])){
                return "blob" + tree[key] + " " + key;
            }else{
                return "tree " + objects.writeTree(tree[key]) + " " + key;
            }
        }).join("\n") + "\n"
        return objects.write(treeObject);
    },

    fileTree: function(treeHash, tree){
// takes a hash tree and finds the corresponding tree object
        if(tree === undefined) {return objects.fileTree(treeHash, {});}
        util.lines(objects.read(treeHash)).forEach(function(line){
            const lineTokens = line.split(/ /);
            tree[lineTokens[2]] = lineTokens[0] === "tree" ?
                objects.fileTree(lineTokens[1], {}) :
                lineTokens[1];
        });
        return tree;
    },

    writeCommit: function(treeHash, message, parentHashes){
// creates a commit object and writes it to the objects database
        return objects.write("commit" + treeHash + "\n" +
            parentHashes
            .map(function(h) {return "parent " + h + "\n";}).join("") +
            "Date " + new Date().toString() + "\n" +
            "\n" +
            "   " + message + "\n");
    },

    write: function(str){
// writes str to the objects database
        files.write(nodePath.join(files.jitletPath(), "objects", utils.hash(str)), str);
        return util.hash(str)
    },
    
    isUpToDate: function(receiverHash, giverHash){
// returns true if the giver commit has already been incorporated into the receiver commit
        return receiverHash !== undefined &&
        (receiverHash === giverHash || objects.isAncestor(receiverHash, giverHash)) 
    },

    exists: function(objectHash){
// returns true if there is an object in the database called objectHash
        return objectHash !== undefined && 
        fs.existsSync(nodePath.join(files.jitletPath(), "objects", objectHash));
    },

    read: function(objectHash){
// returns the content of the object called objectHash
        if(objectHash !== undefined){
            const objectPath = nodePath.join(files.jitletPath(), "objects", objectHash);
            if(fs.existsSync(objectPath)){
                return files.read(objectPath);
            }
        }
    },

    allObjects: function(){
// returns an array of the string content of all the objects
        return fs.readdirSync(files.jitletPath("objects")).map(objects.read);
    },

    type: function(str){
// parses str as an object and returns its type: commit,tree, or blob
        return {commit: "commit", tree: "tree", blob: "tree"}[str.split(" ")[0]] || "blob";
    },

    isAncestor: function(descendantHash, ancestorHash){
// returns true if descendantHash is a descendant of ancestorHash
        return objects.ancestors(descendantHash).indexOf(ancestorHash) !== - 1;

    },

    ancestors: function(commitHash){
// returns an array of the hashes of all the ancestor commits of commitHash
        const parents = objects.parentHashes(objects.read(commitHash));
        return util.flatten(parents.concat(parents.map(objects.ancestors)));
    },

    parentHashes: function(str){
// parses str as a commit and returns the hashes of its parents
        if(objects.type(str) === "commit"){
            return str.split("\n")
            .filter(function(line){ return line.match(/^parent/); })
            .map(function(line){ return line.spit(" ")[1];})
        }
    },

    treeHash: function(str){
// parses str as a commit and returns the tree it points at 
        if(objects.type(str) === "commit"){
            return str.split(/\s/)[1];
        }
    },

    commitToc: function(hash){
// takes the hash of a commit and reads the content stored in the tree on the commit.
        return files.flattenNestedTree(objects.fileTree(objects.treeHash(objects.read(hash))));
    },


};

const index = {
// the index maps files to hashes of their content, when a commit is created a tree is built that mirrors the content of the index
// index entry keys are a (path, stage) combination
    hasFile: function(path, state){
// returns true if there is an entry for path in the index state
        return index.read()[index.key(path, stage)] !== undefined;
    },

    read: function(){
// returns the index as a JS object
        const indexFilePath = files.jitletPath("index");
        return util.lines(fs.existsSync(indexFilePath) ? files.read(indexFilePath) : "\n")
            .reduce(function(idx, blobStr){
                const blobData = blobStr.split(/ /);
                idx[index.key(blobData[0], blobData[1])] = blobData[2];
                return idx;
            }, {});
    },

    key: function(path, stage){
// returns an index key made from path and stage
        return path + "," + stage;
    },

    keyPieces: function(key){
// returns a JS object that contains the path and stage of key
        const pieces = key.split(/,/);
        return { path: pieces[0], stage: parseInt(pieces[1]) };
    },

    toc: function(){
// returns an object that maps file paths to hashes of their content
        const idx = index.read();
        return Object.keys(idx)
            .reduce(function(obj, k) { return util.setIn(obj, [k.split(",")[0], idx[k]]); }, {});
    },

    isFileInConflict: function(path){
// returns true if the file for path is in conflict
        return index.hasFile(path, 2);
    },

    conflictedPaths: function(){
// returns an array of all the paths of files that are in conflict
        const idx = index.read();
        return Object.keys(idx)
            .filter(function(k) { return index.keyPieces(k).stage === 2; })
            .map(function(k) { return index.keyPieces(k).path; });
    },


    writeNonConflict: function(path, content){
// sets a non conflicting index entry for the file at path to the hash of content
        index.writeRm(path);
        index._writeStageEntry(path, 0, content);
    },

    writeConflict: function(path, receiverContent, giverContent, baseContent){
//sets an index entry for the file at path that indicates the file is in conflict after a merge.
        if(baseContent !== undefined){
            index._writeStageEntry(path, 1, baseContent);
        }
        index._writeStageEntry(path, 2, receiverContent);
        index._writeStageEntry(path, 3, receiverContent);
    },

    writeRm: function(path){
// removes the index entry for the file at path
        const idx = index.read();
        [0, 1, 2, 3].forEach(function(stage) { delete idx[index.key(path, stage)]; });
        index.write(idx);
    },

    _writeStageEntry: function(path, stage, content){
// adds the hashed content to the index at key (path, stage)
        const idx = index.read();
        idx[index.key(path, stage)] = objects.write(content);
        index.write(idx);
    },

    write: function(index){
// takes a JS object that represents an index and writes it to .jitlet/index
        const indexStr = Object.keys(index)
            .map(function(k) { return k.split(",")[0] + " " + k.split(",")[1] + " " + index[k] })
            .join("\n") + "\n";
        files.write(files.jitletPath("index"), indexStr);
    },

    workingCopyToc: function(){
// returns an object that maps the file in the working copy to hashes of those files' content
        return Object.keys(index.read())
            .map(function(k) { return k.split(",")[0]; })
            .filter(function(p) { return fs.existsSync(files.workingCopyPath(p)); })
            .reduce(function(idx, p) {
                idx[p] = util.hash(files.read(files.workingCopyPath(p)))
                return idx;
            }, {});
    },

    tocToIndex: function(toc){
// returns an object that maps the file paths in the working copy to hashes of those files' content
        return Object.keys(toc)
            .reduce(function(idx, p) { return util.setIn(idx, [index.key(p, 0), toc[p]]); }, {})
    },

    matchingFiles: function(pathSpec){
// returns all the paths in the index that match pathSpec it matches relative to currentDir
        const searchPath = files.pathFromRepoRoot(pathSpec);
        return Object.keys(index.toc())
            .filter(function(p) { return p.match("^" + searchPath.replace(/\\/g, "\\\\")); });
        
    }
    
};

const diff = {
// Produces diffs between versions of the repository content.
    FILE_STATUS: {ADD: "A", MODIFY: "M", DELETE: "D", SAME: "SAME", CONFLICT: "CONFLICT"},

    diff: function(hash1, hash2){
// returns a diff object. Passes from hash1 to hash2 if hash1 does not pass, then moves to working copy
        const a = hash1 === undefined ? index.toc() : objects.commitToc(hash1);
        const b = hash2 === undefined ? index.workingCopyToc() : objects.commitToc(hash2);
        return diff.tocDiff(a, b);
    },

    nameStatus: function(dif){
// takes a diff and returns a JS object that maps from file paths to file statuses
        return Object.keys(dif)
            .filter(function(p) { return dif[p].status !== diff.FILE_STATUS.SAME; })
            .reduce(function(ns, p) { return util.setIn(ns, [p, dif[p].status]); }, {});
    },

    tocDiff: function(receiver, giver, base){
//takes three JS objects that map file paths to hashes of file content
        function fileStatus(receiver, giver, base){
// takes three strings that represent different versions of the content of a file
            const receiverPresent = receiver !== undefined;
            const basePresent = base !== undefined;
            const giverPresent = giver !== undefined;
            if(receiverPresent && giverPresent && receiver !== giver){
                if (receiver !== base && giver !== base) {
                    return diff.FILE_STATUS.CONFLICT;
                }else{
                    return diff.FILE_STATUS.MODIFY
                }
            }else if(receiver === giver) {
                return diff.FILE_STATUS.SAME;
            }else if((!receiverPresent && !basePresent && giverPresent) || (receiverPresent && !basePresent && !giverPresent)) {
                return diff.FILE_STATUS.ADD;
            }else if((receiverPresent && basePresent && !giverPresent) ||
            (!receiverPresent && basePresent && giverPresent)) {
                return diff.FILE_STATUS.DELETE;
            }
        };
        base = base || receiver;

        const paths = Object.keys(receiver).concat(Object.keys(base)).concat(Object.keys(giver));

        return util.unique(paths).reduce(function (idx, p){
            return util.setIn(idx, [p, {
                status: fileStatus(receiver[p], giver[p], base[p]),
                receiver: receiver[p],
                base: base[p],
                giver: giver[p]
            }]);
        }, {});
    },

    changedFilesCommitWouldOverwrite: function(hash){
// gets a list of files in the working copy
        const headHash = refs.hash("HEAD");
        return util.intersection(Object.keys(diff.nameStatus(diff.diff(headHash))), 
        Object.keys(diff.nameStatus(diff.diff(headHash,hash))));
    },
    
    addedOrModifiedFiles: function(){
//returns a list of files that have been added to or modified in the working copy since the last commit
        const headToc = refs.hash("HEAD") ? objects.commitToc(refs.hash("HEAD")) : {};
        const wc = diff.nameStatus(diff.tocDiff(headToc, index.workingCopyToc()));
        return Object.keys(wc).filter(function(p) { return wc[p] !== diff.FILE_STATUS.DELETE; });
    }
};

const merge = {

    commonAncestor: function(aHash, bHash){
// returns the hash of the commit that is the most recent common ancestor of aHash and bHash
        const sorted = [aHash, bHash].sort();
        aHash = sorted[0];
        bHash = sorted[1];
        const aAncestors = [aHash].concat(objects.ancestors(aHash));
        const bAncestors = [bHash].concat(objects.ancestors(bHash));
        return util.intersection(aAncestors, bAncestors)[0];
    },

    isMergeInProgress: function(){
// returns true if the repository is in the middle of a merge
        return refs.hash("MERGE_HEAD");
    },

    canFastForward: function(receiverHash, giverHash){
// a fast forward is possible if the changes made to get to the giverHash commit already incorporate the changes made to get the receiverHash commit.
        return receiverHash === undefined || objects.isAncestor(giverHash, receiverHash);
    },

    isAForceFetch: function(receiverHash, giverHash){
// returns true if hash for local commit (receiverHash) is not ancestor of hash for fetched commit (giverHash)
        return receiverHash !== undefined && !objects.isAncestor(giverHash, ancestorHash);
    },

    hasConflicts: function(receiverHash, giverHash){
// returns true if merging the commit for giverHash into the commit for receiverHash would produce conflicts
        const mergeDiff = merge.mergeDiff(receiverHash, giverHash);
        return Object.keys(mergeDiff)
        .filter(function(p) { return mergeDiff[p].status === diff.FILE_STATUS.CONFLICT}).length > 0
    },

    mergeDiff: function(receiverHash, giverHash){
//  returns a diff that represents the changes to get from the receiverHash commit to the giverHash commit     
        return diff.tocDiff(objects.commitToc(receiverHash),
                            objects.commitToc(giverHash),
                            objects.commitToc(merge.commonAncestor(receiverHash, giverHash)));
    },

    writeMergeMsg: function(receiverHash, giverHash, ref){
// creates a message for the merge commit that will potentially be created when the giverHash commit is merged into the receiverHash commit
        const msg = "Merge " + ref + " into " + refs.headBranchName();
        const mergeDiff = merge.mergeDiff(receiverHash, giverHash);
        const conflicts = Objects.keys(mergeDiff)
            .filter(function(p) { return mergeDiff[p].status === diff.FILE_STATUS.CONFLICT});
        if (conflicts.length > 0){
            msg += "\nConflicts:\n" + conflicts.join("\n");
        }
        files.write(files.jitletPath("MERGE_MSG"), msg);
    },

    writeIndex: function(receiverHash, giverHash){
//  merges the giverHash commit into the receiverHash commit and writes the merged content to the index
        const mergeDiff = merge.mergeDiff(receiverHash, giverHash);
        index.write({});
        Object.keys(mergeDiff).forEach(function(p){
            if(mergeDiff[p].status === diff.FILE_STATUS.CONFLICT){
                index.writeConflict(p,
                                    objects.read(mergeDiff[p].receiver),
                                    objects.read(mergeDiff[p].giver),
                                    objects.read(mergeDiff[p].base));
            }else if(mergeDiff[p].status === diff.FILE_STATUS.MODIFY){
                index.writeNonConflict(p, objects.read(mergeDiff[p].giver));
            }else if(mergeDiff[p].status === diff.FILE_STATUS.ADD ||
                     mergeDiff[p].status === diff.FILE_STATUS.SAME){
            const content = objects.read(mergeDiff[p].receiver || mergeDiff[p].giver);
            index.writeNonConflict(p, content);
                     }
        });
    },

    writeFastForwardMerge: function(receiverHash, giverHash){
// fast forwarding means making the current branch reflect the commit that giverHash points at
        refs.write(refs.toLocalRef(refs.headBranchName()), giverHash);
        index.write(index.tocToIndex(objects.commitToc(giverHash)));
        if(!config.isBare()){
            const receiverToc = receiverHash === undefined ? {} : objects.commitToc(receiverHash);
            workingCopy.write(diff.tocDiff(receiverToc, objects.commit(giverHash)));
        }
    },

    writeNonFastForwardMerge: function(receiverHash, giverHash, giverRef){
// a non fast forward merge creates a merge commit to integrate the content of the receiverHash commit with the content of the giverHash commit.
        refs.write("MERGE_HEAD", giverHash);
        merge.writeMergeMsg(receiverHash, giverHash, giverRef);
        merge.writeIndex(receiverHash, giverHash);
        if(!config.isBare()){
            workingCopy.write(merge.mergeDiff(receiverHash, giverHash))
        }
    }
};

const workingCopy = {
// the working copy is the set of files that are inside the repository excluding the .jitlet directory
    write: function(dif){
// takes a diff object and applies the changes in it to the working copy
        function composeConflict(receiverFileHash, giverFileHash){
// takes the hashes of two versions of the same file and returns a string that represents the two versions as a conflicted file
            return "<<<<<<\n" + objects.read(receiverFileHash) + 
            "\n======\n" + objects.read(giverFileHash) + "\n>>>>>>\n";
        };
// if there is a conflict the whole file will be marked as a conflict rather than the specific line
        Object.keys(dif).forEach(function(p){
// go through all the files that have changed, updating the working copy for each
            if(dif[p].status === diff.FILE_STATUS.ADD){
                files.write(files.workingCopyPath(p), objects.read(dif[p].receiver || dif[p].giver));
            }else if(dif[p].status === diff.FILE_STATUS.CONFLICT){
                files.write(files.workingCopyPath(p), composeConflict(dif[p].receiver, dif[p].giver));
            }else if(dif[p].status === diff.FILE_STATUS.MODIFY){
                files.write(files.workingCopyPath(p), objects.read(dif[p].giver));
            }else if(dif[p].status === diff.FILE_STATUS.DELETE){
                fs.unlinkSync(files.workingCopyPath(p));
            }
        });
        fs.readdirSync(files.workingCopyPath())
// remove any directories that have been left empty after the deletion of all the files in them
            .filter(function(n) { return n !== ".jitlet"; })
            .forEach(files.rmEmptyDirs);
    }
};







