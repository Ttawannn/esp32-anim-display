#include "commands.h"

#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include "storage/storage.h"

static QueueHandle_t queue = nullptr;
static portMUX_TYPE statusLock = portMUX_INITIALIZER_UNLOCKED;
static PlayerStatus status{};
static UploadResult uploads[16]{};
static uint32_t nextUploadId = 0;
static size_t nextUploadSlot = 0;

void commandsBegin() { queue = xQueueCreate(12, sizeof(Command)); }

bool commandPost(Cmd type, const char* name, int value, uint8_t* data, size_t len, uint32_t uploadId) {
  Command c{type, {0}, data, len, value, uploadId};
  strlcpy(c.name, name ? name : "", sizeof(c.name));
  if (queue && xQueueSend(queue, &c, 0) == pdTRUE) return true;
  free(data);  // queue full: the buffer would leak
  return false;
}

bool commandTake(Command& out) { return queue && xQueueReceive(queue, &out, 0) == pdTRUE; }

uint32_t uploadBegin() {
  portENTER_CRITICAL(&statusLock);
  uint32_t id = 0;
  for (size_t n = 0; n < 16; n++) {
    const size_t i = (nextUploadSlot + n) % 16;
    if (uploads[i].id && uploads[i].state == UploadState::Pending) continue;
    if (++nextUploadId == 0) ++nextUploadId;
    id = nextUploadId;
    uploads[i] = {id, UploadState::Pending};
    nextUploadSlot = (i + 1) % 16;
    break;
  }
  portEXIT_CRITICAL(&statusLock);
  return id;
}

bool uploadRead(uint32_t id, UploadResult& out) {
  bool found = false;
  portENTER_CRITICAL(&statusLock);
  for (const auto& result : uploads) {
    if (id && result.id == id) { out = result; found = true; break; }
  }
  portEXIT_CRITICAL(&statusLock);
  return found;
}

void uploadComplete(uint32_t id, bool saved) {
  portENTER_CRITICAL(&statusLock);
  for (auto& result : uploads) {
    if (id && result.id == id) { result.state = saved ? UploadState::Saved : UploadState::Failed; break; }
  }
  portEXIT_CRITICAL(&statusLock);
}

bool commandCommitUpload(const Command& c) {
  const bool saved = storage::commitUpload((const char*)c.data, c.name);
  if (!saved) LittleFS.remove((const char*)c.data);
  uploadComplete(c.uploadId, saved);
  return saved;
}

void statusPublish(const PlayerStatus& s) {
  portENTER_CRITICAL(&statusLock);
  status = s;
  portEXIT_CRITICAL(&statusLock);
}

PlayerStatus statusRead() {
  portENTER_CRITICAL(&statusLock);
  PlayerStatus s = status;
  portEXIT_CRITICAL(&statusLock);
  return s;
}
