const express = require("express");
const { body, query } = require("express-validator");
const { authRequired, rolesAllowed } = require("../middleware/authMiddleware");
const { getConversations, getMessages, sendAIMessage, sendMessage } = require("../controllers/chatController");

const router = express.Router();

router.use(authRequired, rolesAllowed("citizen", "admin"));

router.get("/conversations", rolesAllowed("admin"), getConversations);
router.get(
  "/messages",
  [
    query("accidentId").optional().isMongoId(),
    query("userId").optional().isMongoId(),
  ],
  getMessages
);
router.post(
  "/messages",
  [
    body("accidentId").isMongoId(),
    body("message").trim().notEmpty(),
    body("userId").optional().isMongoId(),
  ],
  sendMessage
);
router.post(
  "/messages/ai",
  rolesAllowed("admin"),
  [
    body("accidentId").isMongoId(),
    body("userId").isMongoId(),
  ],
  sendAIMessage
);

module.exports = router;
