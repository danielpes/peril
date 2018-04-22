import { NextFunction, Request, Response } from "express"
import winston from "../logger"

import { getDB } from "../db/getDB"
import { createInstallation } from "../github/events/create_installation"
import { githubDangerRunner } from "../github/events/github_runner"
import { ping } from "../github/events/ping"
import { settingsUpdater } from "./settings_updater"

import { RootObject as InstallationCreated } from "../github/events/types/integration_installation_created.types"

/** Logs */
const info = (message: string) => {
  winston.info(`[router] - ${message}`)
}

const router = (req: Request, res: Response, next: NextFunction) => {
  const event = req.header("X-GitHub-Event")
  winston.log("router", `Received ${event}:`)

  githubRouting(event, req, res, next)
}

export const githubRouting = (event: string, req: Request, res: Response, next: NextFunction) => {
  const xhubReq = req as any
  if (!xhubReq.isXHub) {
    return res
      .status(400)
      .send("Request did not include x-hub header - You need to set a secret in the GitHub App + PERIL_WEBHOOK_SECRET.")
  }

  if (!xhubReq.isXHubValid()) {
    return res
      .status(401)
      .send("Request did not have a valid x-hub header. Perhaps PERIL_WEBHOOK_SECRET is not set up right?")
  }

  // res.setHeader("X-Peril-Commit", process.env.COMMIT || "N/A")

  switch (event) {
    case "ping": {
      ping(req, res)
      break
    }

    case "installation": {
      const request = req.body as InstallationCreated
      const action = request.action
      const installation = request.installation
      // Create a db entry for any new installation
      if (action === "created") {
        info(` - Creating new installation`)
        createInstallation(installation, req, res)
        return
      }

      // Delete any integrations that have uninstalled Peril :wave:
      else if (action === "deleted") {
        info(` - Deleting installation ${installation.id}`)
        const db = getDB()
        db.deleteInstallation(installation.id)
        return
      }

      break
    }

    default: {
      info(`Passing ${event} to GH Dangerfile rule router`)

      // Look out for changes to the settting JSON file and update the
      // db accordingly
      settingsUpdater(event, req, res, next)
      githubDangerRunner(event, req, res, next)
    }
  }
  return
}

export default router
