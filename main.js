const core = require('@actions/core')
const github = require('@actions/github')
const AdmZip = require('adm-zip')
const filesize = require('filesize')
const pathname = require('path')
const fs = require('fs')

async function main() {
    try {
        const token = core.getInput("github_token", { required: true })
        const workflow = core.getInput("workflow", { required: true })
        const [owner, repo] = core.getInput("repo", { required: true }).split("/")
        const path = core.getInput("path", { required: true })
            
        // let latestRun
        let runID = 0

        const client = github.getOctokit(token)

        console.log("==> Workflow:", workflow)

        console.log("==> Repo:", owner + "/" + repo)


        for await (const runs of client.paginate.iterator(client.actions.listWorkflowRuns, {
            owner: owner,
            repo: repo,
            workflow_id: workflow,
            per_page: 1,
            page: 1
        }
        )) {
            console.log("==> Number of runs for workflow:", runs.length)
            
            for (const run of runs.data) {
                runID = run.id
                break
            }

            if (runID) {
                break
            }
        }
        
        console.log("==> Latest Run id:", runID)
        
        let artifacts = await client.paginate(client.actions.listWorkflowRunArtifacts, {
            owner: owner,
            repo: repo,
            run_id: runID,
        })


        if (artifacts.length == 0)
            throw new Error("no artifacts found")

        for (const artifact of artifacts) {
            console.log("==> Artifact id:", artifact.id)
            console.log("==> Artifact name:", artifact.name)

            const size = filesize(artifact.size_in_bytes, { base: 10 })

            console.log(`==> Downloading: ${artifact.name}.zip (${size})`)

            const zip = await client.actions.downloadArtifact({
                owner: owner,
                repo: repo,
                artifact_id: artifact.id,
                archive_format: "zip",
            })


            const dir = pathname.join(path, artifact.name)

            fs.mkdirSync(dir, { recursive: true })

            const adm = new AdmZip(Buffer.from(zip.data))

            adm.getEntries().forEach((entry) => {
                const action = entry.isDirectory ? "creating" : "inflating"
                const filepath = pathname.join(dir, entry.entryName)

                console.log(`  ${action}: ${filepath}`)
            })

            adm.extractAllTo(dir, true)
        }
    } catch (error) {
        core.setOutput("error_message", error.message)
        core.setFailed(error.message)
    }
}

main()

