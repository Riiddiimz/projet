# Public readiness gate

Col'inCall is considered public-ready only when all P0 gates below are green on the current production deployment.

- [ ] Next.js production build succeeds
- [ ] Visual Guardian succeeds on mobile, tablet and desktop
- [ ] Full browser QA succeeds against production
- [ ] Multi-user QA succeeds
- [ ] WebRTC QA succeeds
- [ ] Chaos/robustness QA succeeds
- [ ] No unexpected 4xx/5xx asset requests
- [ ] `/health` returns `status: ok`
- [ ] Security headers are present
- [ ] Authentication/session recovery works after WebSocket interruption
- [ ] Microphone/camera permission denial has a recoverable UX
- [ ] Production URL points to the current `main` deployment

Non-P0 polish can continue after launch. No claim of public readiness is made until the gates above are verified against the same deployed revision.
