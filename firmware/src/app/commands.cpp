#include "commands.h"

#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

static QueueHandle_t queue = nullptr;
static portMUX_TYPE statusLock = portMUX_INITIALIZER_UNLOCKED;
static PlayerStatus status{};

void commandsBegin() { queue = xQueueCreate(12, sizeof(Command)); }

bool commandPost(Cmd type, const char* name, int value, uint8_t* data, size_t len) {
  Command c{type, {0}, data, len, value};
  strlcpy(c.name, name ? name : "", sizeof(c.name));
  if (queue && xQueueSend(queue, &c, 0) == pdTRUE) return true;
  free(data);  // queue full: the buffer would leak
  return false;
}

bool commandTake(Command& out) { return queue && xQueueReceive(queue, &out, 0) == pdTRUE; }

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
