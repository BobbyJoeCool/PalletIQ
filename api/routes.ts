// Registers every HTTP route and the timer job: each ./functions module calls app.http()
// / app.timer() when imported. Split out of index.ts (#237) so the API test suite can load
// the same routes and start the app on a free port without index.ts's fixed PORT.
import './functions/auth.js';
import './functions/health.js';
import './functions/pallets.js';
import './functions/locations.js';
import './functions/containers.js';
import './functions/pulls.js';
import './functions/puts.js';
import './functions/staging.js';
import './functions/samples.js';
import './functions/demo-reseed.js';
import './functions/reservationTimer.js';
import './functions/activity.js';
import './functions/items.js';
import './functions/reporting.js';
import './functions/irp.js';
import './functions/reasonCodes.js';
import './functions/containerInquiry.js';
import './functions/pullRequest.js';
import './functions/audit.js';
import './functions/aisles.js';
import './functions/roster.js';
import './functions/prodPlan.js';
import './functions/teamProd.js';
