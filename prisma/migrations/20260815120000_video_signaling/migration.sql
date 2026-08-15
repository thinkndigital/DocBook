-- Self-hosted WebRTC signaling for VIDEO appointments (see CLAUDE.md "telemedicine").
--
-- No video vendor is configured, so SDP offers/answers and ICE candidates are relayed
-- through short-poll reads of this table rather than a vendor's signaling channel. `seq`
-- (not `id`, a random UUID) is the ordering column a poller cursors on.

CREATE TABLE "video_signals" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "videoSessionId" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "video_signals_videoSessionId_seq_idx" ON "video_signals"("videoSessionId", "seq");

ALTER TABLE "video_signals" ADD CONSTRAINT "video_signals_videoSessionId_fkey"
    FOREIGN KEY ("videoSessionId") REFERENCES "video_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
