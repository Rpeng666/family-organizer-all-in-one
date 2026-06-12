# iPhone Shortcuts: Exact Build Recipe for “Add Chore for Today”

This document gives you the exact two-shortcut recipe to build in Apple Shortcuts:

- `Setup / Refresh Family Organizer`
- `Add Chore for Today`

The backend APIs described here already exist in this repo.

## Before You Start

- Build these shortcuts on a Mac if you can. The editor is much easier there, and they’ll sync to your iPhone through iCloud.
- Action names below are the current built-in Shortcuts names. If Apple surfaces a slightly different file action name on your OS version, search for the quoted action name and use the built-in equivalent.
- This recipe assumes your server is already deployed with the new shortcut routes.

## What Gets Stored

The setup shortcut stores one JSON file at:

- `Shortcuts/Family Organizer/AddTodayChore.json`

Expected JSON shape:

```json
{
  "version": 1,
  "serverUrl": "https://example.com",
  "shortcutToken": "fost_...",
  "parentFamilyMemberId": "fm_parent_123",
  "parentName": "David",
  "assignees": [
    { "id": "fm_1", "label": "Judah" },
    { "id": "fm_2", "label": "David (parent)" }
  ],
  "savedAt": "2026-03-22T12:34:56.000Z",
  "lastRefreshedAt": "2026-03-22T12:34:56.000Z"
}
```

Do not store:

- the activation code
- the mobile device session token
- the parent PIN
- the parent Instant token

## Shortcut 1: `Setup / Refresh Family Organizer`

### Goal

This shortcut does two jobs:

1. First-time setup with activation code + parent PIN
2. Future assignee refreshes without asking for credentials again

### Variables Used

Use these exact variable names when the recipe says `Set Variable`:

- `ConfigFile`
- `ConfigDict`
- `ServerUrl`
- `ShortcutToken`
- `ParentFamilyMemberId`
- `ParentName`
- `SavedAt`
- `NowIso`
- `FamilyMembers`
- `AssigneeItems`
- `ParentChoices`
- `ParentLabels`
- `ChosenParentLabel`
- `DeviceSessionToken`
- `ActivationCode`
- `ParentPin`

### Part A: Try Existing Config First

1. Add action: `Get File`
   Configure it to point to:
   - iCloud Drive
   - `Shortcuts/Family Organizer/AddTodayChore.json`
   - Document picker off if your version offers that
   - If your version offers “error if not found,” turn it off

2. Add action: `Set Variable`
   - Name: `ConfigFile`

3. Add action: `If`
   - Condition: `ConfigFile` `has any value`

4. Inside the `If`, add action: `Get Contents of File`
   - Input: `ConfigFile`

5. Add action: `Get Dictionary from Input`

6. Add action: `Set Variable`
   - Name: `ConfigDict`

7. Add action: `Get Dictionary Value`
   - Dictionary: `ConfigDict`
   - Key: `serverUrl`

8. Add action: `Set Variable`
   - Name: `ServerUrl`

9. Add action: `Get Dictionary Value`
   - Dictionary: `ConfigDict`
   - Key: `shortcutToken`

10. Add action: `Set Variable`
    - Name: `ShortcutToken`

11. Add action: `Get Dictionary Value`
    - Dictionary: `ConfigDict`
    - Key: `parentFamilyMemberId`

12. Add action: `Set Variable`
    - Name: `ParentFamilyMemberId`

13. Add action: `Get Dictionary Value`
    - Dictionary: `ConfigDict`
    - Key: `parentName`

14. Add action: `Set Variable`
    - Name: `ParentName`

15. Add action: `Get Dictionary Value`
    - Dictionary: `ConfigDict`
    - Key: `savedAt`

16. Add action: `Set Variable`
    - Name: `SavedAt`

17. Add action: `If`
    - Condition: `ServerUrl` `has any value`

18. Inside that `If`, add action: `If`
    - Condition: `ShortcutToken` `has any value`

19. Inside that nested `If`, add action: `URL`
    - Value:
    ```text
    [ServerUrl]/api/mobile/shortcuts/family-members
    ```
    Use the `ServerUrl` magic variable, then append `/api/mobile/shortcuts/family-members`.

20. Add action: `Get Contents of URL`
    Configure it as:
    - Method: `GET`
    - Headers:
      - `X-Family-Shortcut-Token` = `ShortcutToken`

21. Add action: `Get Dictionary Value`
    - Key: `familyMembers`

22. Add action: `Set Variable`
    - Name: `FamilyMembers`

23. Add action: `If`
    - Condition: `FamilyMembers` `has any value`

24. Inside that `If`, build the cached assignee list:
    - Add action: `Repeat with Each`
      - Repeat over: `FamilyMembers`

25. Inside the repeat, add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `id`

26. Add action: `Set Variable`
    - Name: `LoopMemberId`

27. Add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `label`

28. Add action: `Set Variable`
    - Name: `LoopMemberLabel`

29. Add action: `Dictionary`
    Add two keys:
    - `id` = `LoopMemberId`
    - `label` = `LoopMemberLabel`

30. Add action: `Add to Variable`
    - Variable: `AssigneeItems`

31. End the repeat.

32. Add action: `Current Date`

33. Add action: `Format Date`
    - Format: `ISO 8601`

34. Add action: `Set Variable`
    - Name: `NowIso`

35. Add action: `Dictionary`
    Build the final config dictionary with these keys:
    - `version` = `1`
    - `serverUrl` = `ServerUrl`
    - `shortcutToken` = `ShortcutToken`
    - `parentFamilyMemberId` = `ParentFamilyMemberId`
    - `parentName` = `ParentName`
    - `assignees` = `AssigneeItems`
    - `savedAt` = `SavedAt`
    - `lastRefreshedAt` = `NowIso`

36. Add action: `Get Text from Input`

37. Add action: `Save File`
    Configure it as:
    - Destination: iCloud Drive
    - Path: `Shortcuts/Family Organizer/AddTodayChore.json`
    - Ask Where to Save: `Off`
    - Overwrite If File Exists: `On`

38. Add action: `Show Result`
    - Text:
    ```text
    Family members refreshed.
    ```

39. Add action: `Stop This Shortcut`

40. End the `If FamilyMembers has any value`.

41. End the nested `If ShortcutToken has any value`.

42. End the `If ServerUrl has any value`.

43. End the top-level `If ConfigFile has any value`.

At this point, if refresh succeeded, the shortcut has already stopped. If refresh did not succeed, the shortcut falls through to full setup.

### Part B: Full First-Time Setup / Repair Path

44. Add action: `Ask for Input`
    Configure:
    - Prompt: `Server URL`
    - Default Answer: leave empty or prefill your domain
    - Input Type: `Text`

45. Add action: `Set Variable`
    - Name: `ServerUrl`

46. Add action: `Ask for Input`
    Configure:
    - Prompt: `Activation code`
    - Input Type: `Text`

47. Add action: `Set Variable`
    - Name: `ActivationCode`

48. Add action: `Get Device Details`
    - Detail: `Device Name`

49. Add action: `Set Variable`
    - Name: `DeviceName`

50. Add action: `URL`
    - Value:
    ```text
    [ServerUrl]/api/mobile/device-activate
    ```

51. Add action: `Get Contents of URL`
    Configure it as:
    - Method: `POST`
    - Request Body: `JSON`
    - Headers:
      - `Content-Type` = `application/json`
    - JSON body:
      - `accessKey` = `ActivationCode`
      - `platform` = `ios`
      - `deviceName` = `DeviceName`
      - `appVersion` = `shortcut`

52. Add action: `Get Dictionary Value`
    - Key: `deviceSessionToken`

53. Add action: `Set Variable`
    - Name: `DeviceSessionToken`

54. Add action: `URL`
    - Value:
    ```text
    [ServerUrl]/api/mobile/family-members
    ```

55. Add action: `Get Contents of URL`
    Configure it as:
    - Method: `GET`
    - Headers:
      - `Authorization` = `Bearer [DeviceSessionToken]`

56. Add action: `Get Dictionary Value`
    - Key: `familyMembers`

57. Add action: `Set Variable`
    - Name: `FamilyMembers`

58. Add action: `Repeat with Each`
    - Repeat over: `FamilyMembers`

59. Inside the repeat, add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `role`

60. Add action: `If`
    - Condition: Dictionary Value `is` `parent`

61. Inside that `If`, add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `id`

62. Add action: `Set Variable`
    - Name: `LoopParentId`

63. Add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `name`

64. Add action: `Set Variable`
    - Name: `LoopParentName`

65. Add action: `Text`
    - Value:
    ```text
    [LoopParentName] (parent)
    ```

66. Add action: `Set Variable`
    - Name: `LoopParentLabel`

67. Add action: `Dictionary`
    - `id` = `LoopParentId`
    - `name` = `LoopParentName`
    - `label` = `LoopParentLabel`

68. Add action: `Add to Variable`
    - Variable: `ParentChoices`

69. Add action: `Add to Variable`
    - Variable: `ParentLabels`
    - Value: `LoopParentLabel`

70. End the `If role is parent`.

71. End the repeat.

72. Add action: `Choose from List`
    - List: `ParentLabels`
    - Prompt: `Choose the parent account to authorize this shortcut`

73. Add action: `Set Variable`
    - Name: `ChosenParentLabel`

74. Add action: `Repeat with Each`
    - Repeat over: `ParentChoices`

75. Inside the repeat, add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `label`

76. Add action: `If`
    - Condition: Dictionary Value `is` `ChosenParentLabel`

77. Inside that `If`, add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `id`

78. Add action: `Set Variable`
    - Name: `ParentFamilyMemberId`

79. Add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `name`

80. Add action: `Set Variable`
    - Name: `ParentName`

81. End the `If`.

82. End the repeat.

83. Add action: `Ask for Input`
    Configure:
    - Prompt: `Parent PIN`
    - Input Type: `Number`

84. Add action: `Set Variable`
    - Name: `ParentPin`

85. Add action: `URL`
    - Value:
    ```text
    [ServerUrl]/api/mobile/shortcuts/chore-create-token
    ```

86. Add action: `Get Contents of URL`
    Configure it as:
    - Method: `POST`
    - Request Body: `JSON`
    - Headers:
      - `Content-Type` = `application/json`
      - `Authorization` = `Bearer [DeviceSessionToken]`
    - JSON body:
      - `familyMemberId` = `ParentFamilyMemberId`
      - `pin` = `ParentPin`
      - `label` = `Add Today Chore Shortcut`

87. Add action: `Get Dictionary Value`
    - Key: `shortcutToken`

88. Add action: `Set Variable`
    - Name: `ShortcutToken`

89. Add action: `URL`
    - Value:
    ```text
    [ServerUrl]/api/mobile/shortcuts/family-members
    ```

90. Add action: `Get Contents of URL`
    Configure it as:
    - Method: `GET`
    - Headers:
      - `X-Family-Shortcut-Token` = `ShortcutToken`

91. Add action: `Get Dictionary Value`
    - Key: `familyMembers`

92. Add action: `Set Variable`
    - Name: `FamilyMembers`

93. Add action: `Repeat with Each`
    - Repeat over: `FamilyMembers`

94. Inside the repeat, add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `id`

95. Add action: `Set Variable`
    - Name: `LoopMemberId`

96. Add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `label`

97. Add action: `Set Variable`
    - Name: `LoopMemberLabel`

98. Add action: `Dictionary`
    - `id` = `LoopMemberId`
    - `label` = `LoopMemberLabel`

99. Add action: `Add to Variable`
    - Variable: `AssigneeItems`

100. End the repeat.

101. Add action: `Current Date`

102. Add action: `Format Date`
    - Format: `ISO 8601`

103. Add action: `Set Variable`
    - Name: `NowIso`

104. Add action: `Set Variable`
    - Name: `SavedAt`
    - Value: `NowIso`

105. Add action: `Dictionary`
    Build the final config dictionary:
    - `version` = `1`
    - `serverUrl` = `ServerUrl`
    - `shortcutToken` = `ShortcutToken`
    - `parentFamilyMemberId` = `ParentFamilyMemberId`
    - `parentName` = `ParentName`
    - `assignees` = `AssigneeItems`
    - `savedAt` = `SavedAt`
    - `lastRefreshedAt` = `NowIso`

106. Add action: `Get Text from Input`

107. Add action: `Save File`
    Configure it as:
    - Destination: iCloud Drive
    - Path: `Shortcuts/Family Organizer/AddTodayChore.json`
    - Ask Where to Save: `Off`
    - Overwrite If File Exists: `On`

108. Add action: `Show Result`
    - Text:
    ```text
    Setup complete. The Add Chore shortcut is ready to use.
    ```

## Shortcut 2: `Add Chore for Today`

### Goal

This shortcut:

1. loads the cached config file
2. asks for a title
3. asks which cached assignee to use
4. creates the one-time `anytime` chore for the current family day

It does not refresh family members.

### Variables Used

- `ConfigFile`
- `ConfigDict`
- `ServerUrl`
- `ShortcutToken`
- `Assignees`
- `AssigneeLabels`
- `ChosenAssigneeLabel`
- `AssigneeId`
- `AssigneeDisplay`
- `ChoreTitle`
- `CreateResult`

### Recipe

1. Add action: `Get File`
   Configure it to point to:
   - iCloud Drive
   - `Shortcuts/Family Organizer/AddTodayChore.json`
   - Document picker off if your version offers that

2. Add action: `Set Variable`
   - Name: `ConfigFile`

3. Add action: `If`
   - Condition: `ConfigFile` `has any value`

4. Inside the `If`, add action: `Get Contents of File`
   - Input: `ConfigFile`

5. Add action: `Get Dictionary from Input`

6. Add action: `Set Variable`
   - Name: `ConfigDict`

7. Add action: `Otherwise`
   In the `Otherwise` branch, add:
   - `Show Alert`
     - Title: `Setup required`
     - Message: `Run “Setup / Refresh Family Organizer” first.`
   - `Stop This Shortcut`

8. End the `If`.

9. Add action: `Get Dictionary Value`
   - Dictionary: `ConfigDict`
   - Key: `serverUrl`

10. Add action: `Set Variable`
    - Name: `ServerUrl`

11. Add action: `Get Dictionary Value`
    - Dictionary: `ConfigDict`
    - Key: `shortcutToken`

12. Add action: `Set Variable`
    - Name: `ShortcutToken`

13. Add action: `Get Dictionary Value`
    - Dictionary: `ConfigDict`
    - Key: `assignees`

14. Add action: `Set Variable`
    - Name: `Assignees`

15. Add action: `Ask for Input`
    Configure:
    - Prompt: `Chore title`
    - Input Type: `Text`

16. Add action: `Set Variable`
    - Name: `ChoreTitle`

17. Add action: `Repeat with Each`
    - Repeat over: `Assignees`

18. Inside the repeat, add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `label`

19. Add action: `Add to Variable`
    - Variable: `AssigneeLabels`

20. End the repeat.

21. Add action: `Choose from List`
    - List: `AssigneeLabels`
    - Prompt: `Assign this chore to`

22. Add action: `Set Variable`
    - Name: `ChosenAssigneeLabel`

23. Add action: `Repeat with Each`
    - Repeat over: `Assignees`

24. Inside the repeat, add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `label`

25. Add action: `If`
    - Condition: Dictionary Value `is` `ChosenAssigneeLabel`

26. Inside the `If`, add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `id`

27. Add action: `Set Variable`
    - Name: `AssigneeId`

28. Add action: `Get Dictionary Value`
    - Input: `Repeat Item`
    - Key: `label`

29. Add action: `Set Variable`
    - Name: `AssigneeDisplay`

30. End the `If`.

31. End the repeat.

32. Add action: `URL`
    - Value:
    ```text
    [ServerUrl]/api/mobile/shortcuts/chore-create
    ```

33. Add action: `Get Contents of URL`
    Configure it as:
    - Method: `POST`
    - Request Body: `JSON`
    - Headers:
      - `Content-Type` = `application/json`
      - `X-Family-Shortcut-Token` = `ShortcutToken`
    - JSON body:
      - `title` = `ChoreTitle`
      - `assigneeFamilyMemberId` = `AssigneeId`

34. Add action: `Set Variable`
    - Name: `CreateResult`

35. Add action: `Get Dictionary Value`
    - Dictionary: `CreateResult`
    - Key: `choreId`

36. Add action: `If`
    - Condition: Dictionary Value `has any value`

37. Inside that `If`, add action: `Get Dictionary Value`
    - Dictionary: `CreateResult`
    - Key: `dateKey`

38. Add action: `Set Variable`
    - Name: `DateKey`

39. Add action: `Show Result`
    - Text:
    ```text
    Created “[ChoreTitle]” for [AssigneeDisplay] on [DateKey].
    ```

40. Add action: `Otherwise`

41. In the `Otherwise` branch, add action: `Get Dictionary Value`
    - Dictionary: `CreateResult`
    - Key: `reason`

42. Add action: `Set Variable`
    - Name: `ErrorReason`

43. Add action: `If`
    - Condition: `ErrorReason` `is` `invalid`

44. Inside that `If`, add:
    - `Show Alert`
      - Title: `Setup required`
      - Message: `This shortcut token is no longer valid. Run “Setup / Refresh Family Organizer” again.`
    - `Stop This Shortcut`

45. Add action: `Otherwise`

46. Add action: `If`
    - Condition: `ErrorReason` `is` `revoked`

47. Inside that `If`, add:
    - `Show Alert`
      - Title: `Setup required`
      - Message: `This shortcut token was revoked. Run “Setup / Refresh Family Organizer” again.`
    - `Stop This Shortcut`

48. Add action: `Otherwise`

49. Add action: `Get Dictionary Value`
    - Dictionary: `CreateResult`
    - Key: `error`

50. Add action: `Show Alert`
    - Title: `Could not create chore`
    - Message: use the `error` magic variable

51. End the nested `If`s and the outer `If`.

## API Reference Used by These Shortcuts

### `POST /api/mobile/device-activate`

Request body:

```json
{
  "accessKey": "YOUR_DEVICE_ACCESS_KEY",
  "platform": "ios",
  "deviceName": "Your iPhone Name",
  "appVersion": "shortcut"
}
```

Response:

```json
{
  "deviceSessionToken": "v1....",
  "expiresAt": "2026-04-21T12:34:56.000Z",
  "sessionId": "..."
}
```

### `GET /api/mobile/family-members`

Headers:

- `Authorization: Bearer {deviceSessionToken}`

Response:

```json
{
  "familyMembers": [
    {
      "id": "fm_1",
      "name": "Judah",
      "role": "child",
      "photoUrls": null,
      "hasPin": true
    }
  ]
}
```

### `POST /api/mobile/shortcuts/chore-create-token`

Headers:

- `Authorization: Bearer {deviceSessionToken}`
- `Content-Type: application/json`

Request body:

```json
{
  "familyMemberId": "fm_parent_123",
  "pin": "1234",
  "label": "Add Today Chore Shortcut"
}
```

Response:

```json
{
  "shortcutToken": "fost_...",
  "parentFamilyMemberId": "fm_parent_123",
  "label": "Add Today Chore Shortcut"
}
```

### `GET /api/mobile/shortcuts/family-members`

Headers:

- `X-Family-Shortcut-Token: {shortcutToken}`

Response:

```json
{
  "familyMembers": [
    {
      "id": "fm_1",
      "label": "Judah",
      "name": "Judah",
      "role": "child",
      "photoUrls": null
    }
  ]
}
```

The backend already applies the label rules for duplicates:

1. `name`
2. `name (role)`
3. `name (role • last4id)`

### `POST /api/mobile/shortcuts/chore-create`

Headers:

- `X-Family-Shortcut-Token: {shortcutToken}`
- `Content-Type: application/json`

Request body:

```json
{
  "title": "Clean room",
  "assigneeFamilyMemberId": "fm_1"
}
```

Response:

```json
{
  "choreId": "chore_123",
  "title": "Clean room",
  "assigneeFamilyMemberId": "fm_1",
  "dateKey": "2026-03-22"
}
```

## Recommended Names and Home Screen Labels

- Shortcut name: `Setup / Refresh Family Organizer`
- Shortcut name: `Add Chore for Today`
- Home Screen label: `Add Chore`

## Quick Sanity Check After Building

1. Run `Setup / Refresh Family Organizer`
2. Confirm it saves `AddTodayChore.json`
3. Run `Add Chore for Today`
4. Create a test chore for one family member
5. Confirm it appears in the app as:
   - one-time
   - for today
   - timing mode `anytime`

## Troubleshooting

- If the add shortcut says the token is invalid or revoked, rerun `Setup / Refresh Family Organizer`.
- If refresh does not succeed, the setup shortcut should fall through to the credentialed setup path.
- If your Shortcuts version behaves differently when a URL request returns a `401`, inspect the returned JSON. These APIs always return JSON error bodies with `error` and often `reason`.
