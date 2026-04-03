const express = require("express");
const { body } = require("express-validator");
const {
  getConfig,
  updateConfig,
  getPendingEmulations,
  reviewEmulation,
  transferDuty,
} = require("../controllers/superAdminController");
const { authRequired, rolesAllowed } = require("../middleware/authMiddleware");
const { dutyAdminRequired } = require("../middleware/dutyAdminMiddleware");

const router = express.Router();

router.use(authRequired, rolesAllowed("admin"), dutyAdminRequired);
router.get("/config", getConfig);
router.put("/config", updateConfig);
router.post(
  "/transfer-duty",
  [body("targetUserId").isMongoId().withMessage("Select a valid admin user")],
  transferDuty
);
router.get("/emulations/pending", getPendingEmulations);
router.post("/emulations/:emulationId/review", reviewEmulation);

module.exports = router;
