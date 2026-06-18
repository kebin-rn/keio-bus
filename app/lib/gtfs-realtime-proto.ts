// GTFS-Realtime v2 proto schema (subset used by this app).
// Source: https://github.com/google/transit/blob/master/gtfs-realtime/proto/gtfs-realtime.proto
// 文字列として埋め込み protobufjs.parse() で解釈する。
//
// .proto ファイルを vendor する代わりにここに置く理由:
// - Next.js / Vercel のサーバーレス出力に確実に同梱される (ファイル追跡不要)
// - 1ファイルで完結し、import 解決もシンプル
//
// 必要なメッセージ (FeedMessage / FeedEntity / VehiclePosition / TripUpdate /
// TripDescriptor / Position など) と、それらが参照する enum のみを残してある。
export const GTFS_REALTIME_PROTO = `
syntax = "proto2";

package transit_realtime;

message FeedMessage {
  required FeedHeader header = 1;
  repeated FeedEntity entity = 2;
}

message FeedHeader {
  required string gtfs_realtime_version = 1;
  enum Incrementality {
    FULL_DATASET = 0;
    DIFFERENTIAL = 1;
  }
  optional Incrementality incrementality = 2 [default = FULL_DATASET];
  optional uint64 timestamp = 3;
}

message FeedEntity {
  required string id = 1;
  optional bool is_deleted = 2 [default = false];
  optional TripUpdate trip_update = 3;
  optional VehiclePosition vehicle = 4;
}

message TripUpdate {
  required TripDescriptor trip = 1;
  optional VehicleDescriptor vehicle = 3;

  message StopTimeEvent {
    optional int32 delay = 1;
    optional int64 time = 2;
    optional int32 uncertainty = 3;
  }

  message StopTimeUpdate {
    optional uint32 stop_sequence = 1;
    optional string stop_id = 4;
    optional StopTimeEvent arrival = 2;
    optional StopTimeEvent departure = 3;
    enum ScheduleRelationship {
      SCHEDULED = 0;
      SKIPPED = 1;
      NO_DATA = 2;
      UNSCHEDULED = 3;
    }
    optional ScheduleRelationship schedule_relationship = 5 [default = SCHEDULED];
  }

  repeated StopTimeUpdate stop_time_update = 2;
  optional uint64 timestamp = 4;
  optional int32 delay = 5;
}

message VehiclePosition {
  optional TripDescriptor trip = 1;
  optional VehicleDescriptor vehicle = 8;
  optional Position position = 2;
  optional uint32 current_stop_sequence = 3;
  optional string stop_id = 7;

  enum VehicleStopStatus {
    INCOMING_AT = 0;
    STOPPED_AT = 1;
    IN_TRANSIT_TO = 2;
  }
  optional VehicleStopStatus current_status = 4 [default = IN_TRANSIT_TO];
  optional uint64 timestamp = 5;

  enum CongestionLevel {
    UNKNOWN_CONGESTION_LEVEL = 0;
    RUNNING_SMOOTHLY = 1;
    STOP_AND_GO = 2;
    CONGESTION = 3;
    SEVERE_CONGESTION = 4;
  }
  optional CongestionLevel congestion_level = 6;

  enum OccupancyStatus {
    EMPTY = 0;
    MANY_SEATS_AVAILABLE = 1;
    FEW_SEATS_AVAILABLE = 2;
    STANDING_ROOM_ONLY = 3;
    CRUSHED_STANDING_ROOM_ONLY = 4;
    FULL = 5;
    NOT_ACCEPTING_PASSENGERS = 6;
    NO_DATA_AVAILABLE = 7;
    NOT_BOARDABLE = 8;
  }
  optional OccupancyStatus occupancy_status = 9;
  optional uint32 occupancy_percentage = 10;
}

message TripDescriptor {
  optional string trip_id = 1;
  optional string route_id = 5;
  optional uint32 direction_id = 6;
  optional string start_time = 2;
  optional string start_date = 3;

  enum ScheduleRelationship {
    SCHEDULED = 0;
    ADDED = 1;
    UNSCHEDULED = 2;
    CANCELED = 3;
    DUPLICATED = 6;
  }
  optional ScheduleRelationship schedule_relationship = 4;
}

message VehicleDescriptor {
  optional string id = 1;
  optional string label = 2;
  optional string license_plate = 3;
}

message Position {
  required float latitude = 1;
  required float longitude = 2;
  optional float bearing = 3;
  optional double odometer = 4;
  optional float speed = 5;
}
`;
