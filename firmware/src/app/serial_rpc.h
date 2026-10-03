#pragma once

// USB transport for the web editor (Web Serial). The host sends one JSON request per line,
// prefixed with '@'; the board answers with one '@'-prefixed JSON line. Any other output on the
// port is ordinary log text. Protocol: docs/usb-protocol.md.
void serialRpcHandle(const char* json);
void serialRpcPoll(); // releases an interrupted transfer after an idle timeout
