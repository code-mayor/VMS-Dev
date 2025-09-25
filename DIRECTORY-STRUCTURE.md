VMS_Dev-New:
App.tsx              local               services
Attributions.md      nginx.conf          src
components           package.json        styles
constants            package-lock.json   tailwind.config.cjs
docker-compose.yml   postcss.config.cjs  tsconfig.json
Dockerfile           public              tsconfig.node.json
fix-user-issues.cjs  QUICK-FIX.md        types
hooks                README.md           utils
index.html           scripts             vite.config.js
INSTALLATION.md      server              vite-env.d.ts

VMS_Dev-New/components:
AuditLogs.tsx              OnvifDeviceDiscovery.tsx
auth.tsx                   OnvifVideoStream.tsx
AutoRecordingSettings.tsx  OptimizedDeviceDiscovery.tsx
cards                      OptimizedHLSPlayer.tsx
CustomEvent.tsx            PasswordReset.tsx
DeviceContent.tsx          PTZControls.tsx
dialogs                    RTSPDiagnosticTool.tsx
EnhancedLiveView.tsx       SessionWarningDialog.tsx
ErrorBoundary.tsx          Sidebar.tsx
HLSPlayer.tsx              StreamingTest.tsx
HLSVideoPlayer.tsx         StreamStateManager.tsx
HybridVideoPlayer.tsx      ui
LiveView.tsx               UserManagement.tsx
LoginForm.tsx              VideoPlaybackDialog.tsx
MainContent.tsx            VideoRecording.tsx
MainNavigation.tsx         WebRTCPlayer.tsx
MotionDetection.tsx        WebRTCVideoPlayer.tsx

VMS_Dev-New/components/cards:
DeviceCard.tsx

VMS_Dev-New/components/dialogs:
DeviceAuthDialog.tsx    ManualAddDeviceDialog.tsx
DeviceReauthDialog.tsx  ProfileConfigDialog.tsx
EditDeviceDialog.tsx    ProfileDialogErrorBoundary.tsx
edit-device-tabs        ProfileManagementDialog.tsx
index.ts                UpdateCredentialsDialog.tsx

VMS_Dev-New/components/dialogs/edit-device-tabs:
CredentialsTab.tsx  GeneralTab.tsx  NetworkTab.tsx  SettingsTab.tsx

VMS_Dev-New/components/ui:
accordion.tsx     collapsible.tsx    navigation-menu.tsx  sonner.tsx
alert-dialog.tsx  command.tsx        pagination.tsx       switch.tsx
alert.tsx         context-menu.tsx   popover.tsx          table.tsx
aspect-ratio.tsx  dialog.tsx         progress.tsx         tabs.tsx
avatar.tsx        drawer.tsx         radio-group.tsx      textarea.tsx
badge.tsx         dropdown-menu.tsx  resizable.tsx        toggle-group.tsx
breadcrumb.tsx    form.tsx           scroll-area.tsx      toggle.tsx
button.tsx        hover-card.tsx     select.tsx           tooltip.tsx
calendar.tsx      input-otp.tsx      separator.tsx        use-mobile.ts
card.tsx          input.tsx          sheet.tsx            utils.ts
carousel.tsx      label.tsx          sidebar.tsx
chart.tsx         menubar.tsx        skeleton.tsx
checkbox.tsx      multi-select.tsx   slider.tsx

VMS_Dev-New/constants:
device-constants.tsx  edit-device-constants.tsx

VMS_Dev-New/Dockerfile:
Code-component-8-48.tsx  Code-component-8-55.tsx

VMS_Dev-New/hooks:
useAuth.tsx  useDeviceDiscovery.tsx  useDeviceOperations.tsx

VMS_Dev-New/local:
logs

VMS_Dev-New/local/logs:
app.log  audit.log

VMS_Dev-New/public:
favicon.svg

VMS_Dev-New/scripts:
check-setup.js                      network-scan.js
check-system-status.js              reset-database-with-proper-hashes.js
complete-onvif-discovery-fix.js     setup.js
discover-cameras.js                 start-dev.js
fix-backend-complete.js             test-demo-login.js
fix-backend-startup.js              test-dev.js
fix-connection-issue.js             test-frontend-backend-connection.js
fix-database-schema.js              test-health-check-fix.js
fix-demo-login-complete.js          test-honeywell-stream.js
fix-dependencies.js                 test-login-fix.js
fix-frontend-backend-connection.js  test-onvif-discovery-fix.js
fix-frontend-dependencies.js        test-onvif-profile-discovery.js
fix-hls-dependency.js               test-password-fix-complete.js
fix-npm-dependencies.js             test-registration-fix.js
fix-port-conflict.js                test-route-fix.js
fix-tailwind-css.js                 test-server-health.js
fix-tailwind-postcss.js             test-streaming.js
generate-password-hashes.js         verify-server-fix.js
kill-port.js

VMS_Dev-New/server:
config    index.js         onvif_vms.db      package.json       routes    utils
data      install-deps.js  onvif_vms.db-shm  package-lock.json  scripts
database  logs             onvif_vms.db-wal  public             services

VMS_Dev-New/server/config:
database.js

VMS_Dev-New/server/data:

VMS_Dev-New/server/database:
devices.js  init.js

VMS_Dev-New/server/logs:

VMS_Dev-New/server/public:
hls  recordings

VMS_Dev-New/server/public/hls:

VMS_Dev-New/server/public/recordings:

VMS_Dev-New/server/routes:
audit.js  devices.js  motion.js          recordings-fixed.js  streams.js
auth.js   health.js   onvif-profiles.js  recordings.js

VMS_Dev-New/server/scripts:
create-admin-user.js

VMS_Dev-New/server/services:
enhanced-onvif-discovery.js  onvif-discovery.js
hls-streaming-service.js     onvif-profile-discovery.js

VMS_Dev-New/server/utils:
database-migration.js  mysql-migration.js  setup.js
logger.js              seed-database.js

VMS_Dev-New/services:
auth-service.tsx               local-auth-service.tsx
chunked-recording-service.tsx  onvif-profile-discovery.tsx
enhanced-onvif-service.tsx     onvif-service.tsx
frontend-onvif-service.tsx     recording-service.tsx
hls-streaming-service.tsx      webrtc-streaming-service.tsx

VMS_Dev-New/src:
main.tsx

VMS_Dev-New/styles:
globals.css

VMS_Dev-New/types:
device-types.tsx  edit-device-types.tsx

VMS_Dev-New/utils:
device-helpers.tsx  edit-device-helpers.tsx  supabase

VMS_Dev-New/utils/supabase:
info.tsx
