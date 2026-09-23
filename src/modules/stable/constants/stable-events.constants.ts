/**
 * Tên domain event phát ra sau khi phân công Groom của một con ngựa thay đổi (giao mới, đổi, gỡ; F1.7) và transaction đã commit.
 * Payload là GroomAssignmentChangedEvent; module notifications nghe event này để báo Groom mới và Groom cũ.
 */
export const GROOM_ASSIGNMENT_CHANGED_EVENT = 'stable.groom-assignment.changed';
