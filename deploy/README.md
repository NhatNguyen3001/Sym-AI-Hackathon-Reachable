# Demo hosting (Vercel + on-demand AWS Fargate)

The web app runs on Vercel. The backend (API + Valhalla) runs on AWS **only while you need it**: one Fargate task
(2 vCPU, 4 GB, about US$0.12 an hour) behind a fixed CloudFront HTTPS address. It costs nothing while stopped,
apart from a few cents a month for the stored images.

Run these from the repo folder in PowerShell (AWS CLI signed in, region `ap-southeast-2`; Docker running for push).

| When | Command | What it does |
|---|---|---|
| Once (and after changing the template) | `powershell -File deploy\setup.ps1` (then `start.ps1` again if it was running: a stack update resets CloudFront's pointer to the task) | Copies the keys from `api\.env` into AWS Parameter Store (encrypted, never printed) and creates the stack. Prints the fixed API address. |
| After code changes | `powershell -File deploy\push.ps1` | Builds and uploads both images. Then `start.ps1 -Fresh`. |
| Before a demo | `powershell -File deploy\start.ps1` | Starts the task, points CloudFront at it, waits until it answers, and schedules the automatic stop **9 hours** later. ~3–5 minutes. |
| After a demo | `powershell -File deploy\stop.ps1` | Stops it now and removes the automatic stop. |
| Any time | `powershell -File deploy\status.ps1` | Running or not, health, and when it stops itself. |
| Before judging | `api\.venv\Scripts\python deploy\loadtest.py --base <API address> --users 80` | 80 simulated judges for 5 minutes: response times and errors. |

The demo task runs with `DEMO_SANDBOX=true` (each phone's reports and rain toggle stay its own, never saved),
`MAP_AGENT_PAUSED=true` and photo uploads off.

**Vercel:** the `web` folder is the project. Set `NEXT_PUBLIC_API_URL` to the API address before building, then
re-run `setup.ps1 -VercelUrl https://<your-site>.vercel.app` so only your site may call the API.
