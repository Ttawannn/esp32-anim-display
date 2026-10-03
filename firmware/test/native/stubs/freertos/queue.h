#pragma once
#include <deque>
#include <vector>
struct NativeQueue { size_t capacity, itemSize; std::deque<std::vector<uint8_t>> items; };
using QueueHandle_t = NativeQueue*;
inline QueueHandle_t xQueueCreate(size_t capacity, size_t size) { return new NativeQueue{capacity, size, {}}; }
inline int xQueueSend(QueueHandle_t queue, const void* data, int) {
  if (queue->items.size() == queue->capacity) return 0;
  auto* bytes = static_cast<const uint8_t*>(data);
  queue->items.emplace_back(bytes, bytes + queue->itemSize);
  return pdTRUE;
}
inline int xQueueReceive(QueueHandle_t queue, void* data, int) {
  if (queue->items.empty()) return 0;
  memcpy(data, queue->items.front().data(), queue->itemSize);
  queue->items.pop_front();
  return pdTRUE;
}
