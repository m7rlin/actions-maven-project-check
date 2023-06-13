import core from '@actions/core';
import github from '@actions/github';
import xml2js from 'xml2js';
import fs from 'fs';
import path from 'path';
import semverDiff from 'semver-diff';

// Config
const repositoryLocalWorkspace = process.env.GITHUB_WORKSPACE + '/';

const parser = new xml2js.Parser();

// Helper functions

function getProjectVersionFromMavenFile(fileContent) {
    const project = {};

    parser.parseString(fileContent, function (err) {
        project.version = String(result.project.version);
    });
    parser.parseString(fileContent, function (err) {
        project.minecraftVersion = String(result.project.version);
    });

    return project;
}

function getProjectVersionFromPackageJsonFile(fileContent) {
    return JSON.parse(fileContent).version;
}

function getProjectVersion(fileContent, fileName) {
    if (fileName === 'pom.xml') {
        return getProjectVersionFromMavenFile(fileContent).version;
    }

    if (fileName === 'package.json') {
        return getProjectVersionFromPackageJsonFile(fileContent);
    }

    if (fileName === 'version.txt') {
        return new String(fileContent).trim();
    }

    core.setFailed('"' + fileName + '" is not supported!');
    return undefined;
}

function checkVersionUpdate(
    targetVersion,
    branchVersion,
    additionalFilesToCheck
) {
    var result = semverDiff(targetVersion, branchVersion);

    if (!result) {
        console.log('targetVersion: ' + targetVersion);
        console.log('branchVersion: ' + branchVersion);
        console.log('semverDiff: ' + result);
        core.setFailed('You have to update the project version!');
    } else if (additionalFilesToCheck != undefined) {
        additionalFilesToCheck.forEach((file) => {
            var fileContent = fs.readFileSync(
                repositoryLocalWorkspace + file.trim()
            );

            if (
                !fileContent.includes(branchVersion) ||
                fileContent.includes(targetVersion)
            ) {
                core.setFailed(
                    'You have to update the project version in "' + file + '"!'
                );
            }
        });
    }
}

// Main
async function run() {
    try {
        // Setup objects
        var octokit = new github.getOctokit(core.getInput('token'));

        // Get repository owner and name
        var repository = process.env.GITHUB_REPOSITORY.split('/');
        var repositoryOwner = repository[0];
        var repositoryName = repository[1];

        // Get file with updated project version
        var fileToCheck = core.getInput('file-to-check');

        // Get additional files with updated project version
        var additionalFilesToCheck = core.getInput('additional-files-to-check');
        additionalFilesToCheck =
            additionalFilesToCheck != '' ? additionalFilesToCheck : undefined;
        if (additionalFilesToCheck != undefined) {
            additionalFilesToCheck = additionalFilesToCheck.split(',');
        }

        // Get target branch
        var event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH));
        var targetBranch =
            event && event.pull_request && event.pull_request.base
                ? event.pull_request.base.ref
                : 'master';

        // Get updated project version
        var updatedBranchFileContent = fs.readFileSync(
            repositoryLocalWorkspace + fileToCheck
        );
        const fileName = path.basename(repositoryLocalWorkspace + fileToCheck);
        var updatedProjectVersion = getProjectVersion(
            updatedBranchFileContent,
            fileName
        );

        // Check version update
        if (core.getInput('check-version-update') == 'true') {
            octokit.rest.repos
                .getContent({
                    owner: repositoryOwner,
                    repo: repositoryName,
                    path: fileToCheck,
                    ref: targetBranch,
                    headers: { Accept: 'application/vnd.github.v3.raw' },
                })
                .then((response) => {
                    // Get target project version
                    var targetBranchFileContent = response.data;
                    var targetProjectVersion = getProjectVersion(
                        targetBranchFileContent,
                        fileName
                    );

                    checkVersionUpdate(
                        targetProjectVersion,
                        updatedProjectVersion,
                        additionalFilesToCheck
                    );
                })
                .catch((error) =>
                    console.log(
                        'Cannot resolve `' +
                            fileToCheck +
                            '` in target branch! No version check required. ErrMsg => ' +
                            error
                    )
                );
        }

        // Set outputs
        core.setOutput('version', updatedProjectVersion);
    } catch (error) {
        core.setFailed(error.message);
    }
}

// Start ACTION
run();

// Exports for unit testing
export default {
    getProjectVersion,
    getProjectVersionFromMavenFile,
    getProjectVersionFromPackageJsonFile,
    checkVersionUpdate,
};
