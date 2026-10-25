/* ==========================================================================
   extensions/graphics/clib.js — the C libraries that "pacman" installs:
   raylib, raymath, OpenGL (gl.h, glu.h), freeglut, GLFW and GLEW.

   They are browser versions written for Smoki's Code: drawing goes to a
   few JavaScript functions (sg_*, c2_*) and OpenGL calls go to WebGL by
   name (see graphics.js). They compile with xcc together with your code.
   Each package lists the headers it adds and the C files it links.
   ========================================================================== */
(function (SC) {
  'use strict';

  /* ---------------------------------------------------------------- shared */
  const SG_H = String.raw`/* smoki_gfx.h: the browser window behind raylib, GLUT and GLFW */
#ifndef SMOKI_GFX_H
#define SMOKI_GFX_H
typedef struct sg_event { int type; int key; int ch; int mods; int x; int y; int button; float wheel; } sg_event;
enum { SG_KEYDOWN = 1, SG_KEYUP = 2, SG_CHAR = 3, SG_MOUSEDOWN = 4, SG_MOUSEUP = 5, SG_MOUSEMOVE = 6, SG_WHEEL = 7, SG_CLOSE = 8 };
void sg_window(int w, int h, const char *title);
void sg_title(const char *title);
void sg_close(void);
void sg_frame(void);          /* show the frame and wait for the next one */
void sg_fps(int fps);
double sg_time(void);
float sg_frame_time(void);
int sg_get_fps(void);
int sg_should_close(void);
int sg_key(int key);           /* bit 1 down, 2 pressed, 4 released this frame */
int sg_next_key(void);
int sg_next_char(void);
int sg_mouse_x(void);
int sg_mouse_y(void);
int sg_mouse_button(int b);    /* bit 1 down, 2 pressed, 4 released */
float sg_wheel(void);
int sg_poll(sg_event *e);      /* 1 when an event was written */
int sg_width(void);
int sg_height(void);
void sg_warn(const char *text);
#endif
`;

  const MATHF = String.raw`
/* float versions (added by Smoki's Code) */
static inline float sinf(float x) { return (float)sin(x); }
static inline float cosf(float x) { return (float)cos(x); }
static inline float tanf(float x) { return (float)tan(x); }
static inline float asinf(float x) { return (float)asin(x); }
static inline float acosf(float x) { return (float)acos(x); }
static inline float atanf(float x) { return (float)atan(x); }
static inline float atan2f(float y, float x) { return (float)atan2(y, x); }
static inline float sqrtf(float x) { return (float)sqrt(x); }
static inline float powf(float b, float e) { return (float)pow(b, e); }
static inline float expf(float x) { return (float)exp(x); }
static inline float logf(float x) { return (float)log(x); }
static inline float floorf(float x) { return (float)floor(x); }
static inline float ceilf(float x) { return (float)ceil(x); }
static inline float roundf(float x) { return (float)round(x); }
static inline float fmodf(float x, float m) { return (float)fmod(x, m); }
static inline float fminf(float a, float b) { return a < b ? a : b; }
static inline float fmaxf(float a, float b) { return a > b ? a : b; }
static inline double fmin(double a, double b) { return a < b ? a : b; }
static inline double fmax(double a, double b) { return a > b ? a : b; }
static inline float hypotf(float x, float y) { return (float)sqrt((double)x * x + (double)y * y); }
static inline double hypot(double x, double y) { return sqrt(x * x + y * y); }
static inline double trunc(double x) { return x < 0 ? ceil(x) : floor(x); }
static inline float truncf(float x) { return (float)trunc(x); }
`;

  /* ---------------------------------------------------------------- raylib */
  const RAYLIB_H = String.raw`/* raylib.h (Smoki's Code browser version of the raylib 5.5 API, 2D) */
#ifndef RAYLIB_H
#define RAYLIB_H
#include <stdbool.h>
#include <stdarg.h>

#define RAYLIB_VERSION_MAJOR 5
#define RAYLIB_VERSION_MINOR 5
#define RAYLIB_VERSION "5.5"
#ifndef PI
#define PI 3.14159265358979323846f
#endif
#ifndef DEG2RAD
#define DEG2RAD (PI/180.0f)
#endif
#ifndef RAD2DEG
#define RAD2DEG (180.0f/PI)
#endif
#define CLITERAL(type) (type)
#define RL_MALLOC(sz) malloc(sz)
#define RL_FREE(p) free(p)

typedef struct Vector2 { float x; float y; } Vector2;
typedef struct Vector3 { float x; float y; float z; } Vector3;
typedef struct Vector4 { float x; float y; float z; float w; } Vector4;
typedef Vector4 Quaternion;
typedef struct Matrix { float m0, m4, m8, m12, m1, m5, m9, m13, m2, m6, m10, m14, m3, m7, m11, m15; } Matrix;
typedef struct Color { unsigned char r; unsigned char g; unsigned char b; unsigned char a; } Color;
typedef struct Rectangle { float x; float y; float width; float height; } Rectangle;
typedef struct Image { void *data; int width; int height; int mipmaps; int format; } Image;
typedef struct Texture { unsigned int id; int width; int height; int mipmaps; int format; } Texture;
typedef Texture Texture2D;
typedef Texture TextureCubemap;
typedef struct RenderTexture { unsigned int id; Texture texture; Texture depth; } RenderTexture;
typedef RenderTexture RenderTexture2D;
typedef struct Font { int baseSize; int glyphCount; int glyphPadding; Texture2D texture; void *recs; void *glyphs; } Font;
typedef struct Camera2D { Vector2 offset; Vector2 target; float rotation; float zoom; } Camera2D;
typedef struct Camera3D { Vector3 position; Vector3 target; Vector3 up; float fovy; int projection; } Camera3D;
typedef Camera3D Camera;
typedef struct Sound { unsigned int frameCount; int id; } Sound;
typedef struct Music { unsigned int frameCount; bool looping; int id; } Music;
typedef struct Wave { unsigned int frameCount; unsigned int sampleRate; unsigned int sampleSize; unsigned int channels; void *data; } Wave;

#define LIGHTGRAY  CLITERAL(Color){ 200, 200, 200, 255 }
#define GRAY       CLITERAL(Color){ 130, 130, 130, 255 }
#define DARKGRAY   CLITERAL(Color){ 80, 80, 80, 255 }
#define YELLOW     CLITERAL(Color){ 253, 249, 0, 255 }
#define GOLD       CLITERAL(Color){ 255, 203, 0, 255 }
#define ORANGE     CLITERAL(Color){ 255, 161, 0, 255 }
#define PINK       CLITERAL(Color){ 255, 109, 194, 255 }
#define RED        CLITERAL(Color){ 230, 41, 55, 255 }
#define MAROON     CLITERAL(Color){ 190, 33, 55, 255 }
#define GREEN      CLITERAL(Color){ 0, 228, 48, 255 }
#define LIME       CLITERAL(Color){ 0, 158, 47, 255 }
#define DARKGREEN  CLITERAL(Color){ 0, 117, 44, 255 }
#define SKYBLUE    CLITERAL(Color){ 102, 191, 255, 255 }
#define BLUE       CLITERAL(Color){ 0, 121, 241, 255 }
#define DARKBLUE   CLITERAL(Color){ 0, 82, 172, 255 }
#define PURPLE     CLITERAL(Color){ 200, 122, 255, 255 }
#define VIOLET     CLITERAL(Color){ 135, 60, 190, 255 }
#define DARKPURPLE CLITERAL(Color){ 112, 31, 126, 255 }
#define BEIGE      CLITERAL(Color){ 211, 176, 131, 255 }
#define BROWN      CLITERAL(Color){ 127, 106, 79, 255 }
#define DARKBROWN  CLITERAL(Color){ 76, 63, 47, 255 }
#define WHITE      CLITERAL(Color){ 255, 255, 255, 255 }
#define BLACK      CLITERAL(Color){ 0, 0, 0, 255 }
#define BLANK      CLITERAL(Color){ 0, 0, 0, 0 }
#define MAGENTA    CLITERAL(Color){ 255, 0, 255, 255 }
#define RAYWHITE   CLITERAL(Color){ 245, 245, 245, 255 }

typedef enum {
  FLAG_VSYNC_HINT = 0x40, FLAG_FULLSCREEN_MODE = 0x2, FLAG_WINDOW_RESIZABLE = 0x4, FLAG_WINDOW_UNDECORATED = 0x8,
  FLAG_WINDOW_HIDDEN = 0x80, FLAG_WINDOW_MINIMIZED = 0x200, FLAG_WINDOW_MAXIMIZED = 0x400, FLAG_WINDOW_UNFOCUSED = 0x800,
  FLAG_WINDOW_TOPMOST = 0x1000, FLAG_WINDOW_ALWAYS_RUN = 0x100, FLAG_WINDOW_TRANSPARENT = 0x10, FLAG_WINDOW_HIGHDPI = 0x2000,
  FLAG_MSAA_4X_HINT = 0x20, FLAG_INTERLACED_HINT = 0x10000
} ConfigFlags;
typedef enum { LOG_ALL = 0, LOG_TRACE, LOG_DEBUG, LOG_INFO, LOG_WARNING, LOG_ERROR, LOG_FATAL, LOG_NONE } TraceLogLevel;
typedef enum {
  KEY_NULL = 0, KEY_APOSTROPHE = 39, KEY_COMMA = 44, KEY_MINUS = 45, KEY_PERIOD = 46, KEY_SLASH = 47,
  KEY_ZERO = 48, KEY_ONE = 49, KEY_TWO = 50, KEY_THREE = 51, KEY_FOUR = 52, KEY_FIVE = 53, KEY_SIX = 54, KEY_SEVEN = 55, KEY_EIGHT = 56, KEY_NINE = 57,
  KEY_SEMICOLON = 59, KEY_EQUAL = 61,
  KEY_A = 65, KEY_B = 66, KEY_C = 67, KEY_D = 68, KEY_E = 69, KEY_F = 70, KEY_G = 71, KEY_H = 72, KEY_I = 73, KEY_J = 74, KEY_K = 75, KEY_L = 76, KEY_M = 77,
  KEY_N = 78, KEY_O = 79, KEY_P = 80, KEY_Q = 81, KEY_R = 82, KEY_S = 83, KEY_T = 84, KEY_U = 85, KEY_V = 86, KEY_W = 87, KEY_X = 88, KEY_Y = 89, KEY_Z = 90,
  KEY_LEFT_BRACKET = 91, KEY_BACKSLASH = 92, KEY_RIGHT_BRACKET = 93, KEY_GRAVE = 96,
  KEY_SPACE = 32, KEY_ESCAPE = 256, KEY_ENTER = 257, KEY_TAB = 258, KEY_BACKSPACE = 259, KEY_INSERT = 260, KEY_DELETE = 261,
  KEY_RIGHT = 262, KEY_LEFT = 263, KEY_DOWN = 264, KEY_UP = 265, KEY_PAGE_UP = 266, KEY_PAGE_DOWN = 267, KEY_HOME = 268, KEY_END = 269,
  KEY_CAPS_LOCK = 280, KEY_SCROLL_LOCK = 281, KEY_NUM_LOCK = 282, KEY_PRINT_SCREEN = 283, KEY_PAUSE = 284,
  KEY_F1 = 290, KEY_F2 = 291, KEY_F3 = 292, KEY_F4 = 293, KEY_F5 = 294, KEY_F6 = 295, KEY_F7 = 296, KEY_F8 = 297, KEY_F9 = 298, KEY_F10 = 299, KEY_F11 = 300, KEY_F12 = 301,
  KEY_LEFT_SHIFT = 340, KEY_LEFT_CONTROL = 341, KEY_LEFT_ALT = 342, KEY_LEFT_SUPER = 343,
  KEY_RIGHT_SHIFT = 344, KEY_RIGHT_CONTROL = 345, KEY_RIGHT_ALT = 346, KEY_RIGHT_SUPER = 347, KEY_KB_MENU = 348,
  KEY_KP_0 = 320, KEY_KP_1 = 321, KEY_KP_2 = 322, KEY_KP_3 = 323, KEY_KP_4 = 324, KEY_KP_5 = 325, KEY_KP_6 = 326, KEY_KP_7 = 327, KEY_KP_8 = 328, KEY_KP_9 = 329,
  KEY_KP_DECIMAL = 330, KEY_KP_DIVIDE = 331, KEY_KP_MULTIPLY = 332, KEY_KP_SUBTRACT = 333, KEY_KP_ADD = 334, KEY_KP_ENTER = 335, KEY_KP_EQUAL = 336,
  KEY_BACK = 4, KEY_MENU = 5, KEY_VOLUME_UP = 24, KEY_VOLUME_DOWN = 25
} KeyboardKey;
typedef enum { MOUSE_BUTTON_LEFT = 0, MOUSE_BUTTON_RIGHT = 1, MOUSE_BUTTON_MIDDLE = 2, MOUSE_BUTTON_SIDE = 3, MOUSE_BUTTON_EXTRA = 4, MOUSE_BUTTON_FORWARD = 5, MOUSE_BUTTON_BACK = 6 } MouseButton;
#define MOUSE_LEFT_BUTTON MOUSE_BUTTON_LEFT
#define MOUSE_RIGHT_BUTTON MOUSE_BUTTON_RIGHT
#define MOUSE_MIDDLE_BUTTON MOUSE_BUTTON_MIDDLE
typedef enum { MOUSE_CURSOR_DEFAULT = 0, MOUSE_CURSOR_ARROW = 1, MOUSE_CURSOR_IBEAM = 2, MOUSE_CURSOR_CROSSHAIR = 3, MOUSE_CURSOR_POINTING_HAND = 4 } MouseCursor;
typedef enum { CAMERA_PERSPECTIVE = 0, CAMERA_ORTHOGRAPHIC } CameraProjection;
typedef enum { CAMERA_CUSTOM = 0, CAMERA_FREE, CAMERA_ORBITAL, CAMERA_FIRST_PERSON, CAMERA_THIRD_PERSON } CameraMode;
typedef enum { BLEND_ALPHA = 0, BLEND_ADDITIVE, BLEND_MULTIPLIED, BLEND_ADD_COLORS, BLEND_SUBTRACT_COLORS } BlendMode;

/* Window */
void InitWindow(int width, int height, const char *title);
void CloseWindow(void);
bool WindowShouldClose(void);
bool IsWindowReady(void);
bool IsWindowFocused(void);
bool IsWindowResized(void);
void SetWindowTitle(const char *title);
void SetWindowSize(int width, int height);
void SetWindowPosition(int x, int y);
void SetWindowMinSize(int width, int height);
void SetConfigFlags(unsigned int flags);
void SetWindowState(unsigned int flags);
void ClearWindowState(unsigned int flags);
void ToggleFullscreen(void);
int GetScreenWidth(void);
int GetScreenHeight(void);
int GetRenderWidth(void);
int GetRenderHeight(void);
int GetMonitorWidth(int monitor);
int GetMonitorHeight(int monitor);
void SetExitKey(int key);
void ShowCursor(void);
void HideCursor(void);
void DisableCursor(void);
void EnableCursor(void);
void SetMouseCursor(int cursor);

/* Drawing */
void ClearBackground(Color color);
void BeginDrawing(void);
void EndDrawing(void);
void BeginMode2D(Camera2D camera);
void EndMode2D(void);
void BeginMode3D(Camera3D camera);
void EndMode3D(void);
void BeginScissorMode(int x, int y, int width, int height);
void EndScissorMode(void);
void BeginBlendMode(int mode);
void EndBlendMode(void);

/* Timing */
void SetTargetFPS(int fps);
float GetFrameTime(void);
double GetTime(void);
int GetFPS(void);
void WaitTime(double seconds);

/* Random, logging, files */
void SetRandomSeed(unsigned int seed);
int GetRandomValue(int min, int max);
void TraceLog(int logLevel, const char *text, ...);
void SetTraceLogLevel(int logLevel);
void TakeScreenshot(const char *fileName);
void OpenURL(const char *url);

/* Input */
bool IsKeyPressed(int key);
bool IsKeyPressedRepeat(int key);
bool IsKeyDown(int key);
bool IsKeyReleased(int key);
bool IsKeyUp(int key);
int GetKeyPressed(void);
int GetCharPressed(void);
bool IsMouseButtonPressed(int button);
bool IsMouseButtonDown(int button);
bool IsMouseButtonReleased(int button);
bool IsMouseButtonUp(int button);
int GetMouseX(void);
int GetMouseY(void);
Vector2 GetMousePosition(void);
Vector2 GetMouseDelta(void);
void SetMousePosition(int x, int y);
float GetMouseWheelMove(void);
Vector2 GetMouseWheelMoveV(void);
int GetTouchX(void);
int GetTouchY(void);
Vector2 GetTouchPosition(int index);
int GetTouchPointCount(void);

/* Shapes */
void DrawPixel(int posX, int posY, Color color);
void DrawPixelV(Vector2 position, Color color);
void DrawLine(int startPosX, int startPosY, int endPosX, int endPosY, Color color);
void DrawLineV(Vector2 startPos, Vector2 endPos, Color color);
void DrawLineEx(Vector2 startPos, Vector2 endPos, float thick, Color color);
void DrawLineStrip(const Vector2 *points, int pointCount, Color color);
void DrawLineBezier(Vector2 startPos, Vector2 endPos, float thick, Color color);
void DrawCircle(int centerX, int centerY, float radius, Color color);
void DrawCircleV(Vector2 center, float radius, Color color);
void DrawCircleSector(Vector2 center, float radius, float startAngle, float endAngle, int segments, Color color);
void DrawCircleSectorLines(Vector2 center, float radius, float startAngle, float endAngle, int segments, Color color);
void DrawCircleGradient(int centerX, int centerY, float radius, Color inner, Color outer);
void DrawCircleLines(int centerX, int centerY, float radius, Color color);
void DrawCircleLinesV(Vector2 center, float radius, Color color);
void DrawEllipse(int centerX, int centerY, float radiusH, float radiusV, Color color);
void DrawEllipseLines(int centerX, int centerY, float radiusH, float radiusV, Color color);
void DrawRing(Vector2 center, float innerRadius, float outerRadius, float startAngle, float endAngle, int segments, Color color);
void DrawRingLines(Vector2 center, float innerRadius, float outerRadius, float startAngle, float endAngle, int segments, Color color);
void DrawRectangle(int posX, int posY, int width, int height, Color color);
void DrawRectangleV(Vector2 position, Vector2 size, Color color);
void DrawRectangleRec(Rectangle rec, Color color);
void DrawRectanglePro(Rectangle rec, Vector2 origin, float rotation, Color color);
void DrawRectangleGradientV(int posX, int posY, int width, int height, Color top, Color bottom);
void DrawRectangleGradientH(int posX, int posY, int width, int height, Color left, Color right);
void DrawRectangleGradientEx(Rectangle rec, Color topLeft, Color bottomLeft, Color topRight, Color bottomRight);
void DrawRectangleLines(int posX, int posY, int width, int height, Color color);
void DrawRectangleLinesEx(Rectangle rec, float lineThick, Color color);
void DrawRectangleRounded(Rectangle rec, float roundness, int segments, Color color);
void DrawRectangleRoundedLines(Rectangle rec, float roundness, int segments, Color color);
void DrawRectangleRoundedLinesEx(Rectangle rec, float roundness, int segments, float lineThick, Color color);
void DrawTriangle(Vector2 v1, Vector2 v2, Vector2 v3, Color color);
void DrawTriangleLines(Vector2 v1, Vector2 v2, Vector2 v3, Color color);
void DrawTriangleFan(const Vector2 *points, int pointCount, Color color);
void DrawTriangleStrip(const Vector2 *points, int pointCount, Color color);
void DrawPoly(Vector2 center, int sides, float radius, float rotation, Color color);
void DrawPolyLines(Vector2 center, int sides, float radius, float rotation, Color color);
void DrawPolyLinesEx(Vector2 center, int sides, float radius, float rotation, float lineThick, Color color);

/* Collisions */
bool CheckCollisionRecs(Rectangle rec1, Rectangle rec2);
bool CheckCollisionCircles(Vector2 center1, float radius1, Vector2 center2, float radius2);
bool CheckCollisionCircleRec(Vector2 center, float radius, Rectangle rec);
bool CheckCollisionPointRec(Vector2 point, Rectangle rec);
bool CheckCollisionPointCircle(Vector2 point, Vector2 center, float radius);
bool CheckCollisionPointTriangle(Vector2 point, Vector2 p1, Vector2 p2, Vector2 p3);
bool CheckCollisionLines(Vector2 startPos1, Vector2 endPos1, Vector2 startPos2, Vector2 endPos2, Vector2 *collisionPoint);
Rectangle GetCollisionRec(Rectangle rec1, Rectangle rec2);

/* Textures (pictures are not loaded in the browser version) */
Image LoadImage(const char *fileName);
Image GenImageColor(int width, int height, Color color);
void UnloadImage(Image image);
Texture2D LoadTexture(const char *fileName);
Texture2D LoadTextureFromImage(Image image);
void UnloadTexture(Texture2D texture);
bool IsTextureReady(Texture2D texture);
void DrawTexture(Texture2D texture, int posX, int posY, Color tint);
void DrawTextureV(Texture2D texture, Vector2 position, Color tint);
void DrawTextureEx(Texture2D texture, Vector2 position, float rotation, float scale, Color tint);
void DrawTextureRec(Texture2D texture, Rectangle source, Vector2 position, Color tint);
void DrawTexturePro(Texture2D texture, Rectangle source, Rectangle dest, Vector2 origin, float rotation, Color tint);
RenderTexture2D LoadRenderTexture(int width, int height);
void UnloadRenderTexture(RenderTexture2D target);
void BeginTextureMode(RenderTexture2D target);
void EndTextureMode(void);

/* Colors */
Color Fade(Color color, float alpha);
Color ColorAlpha(Color color, float alpha);
int ColorToInt(Color color);
Color GetColor(unsigned int hexValue);
Color ColorFromHSV(float hue, float saturation, float value);
Vector3 ColorToHSV(Color color);
Color ColorBrightness(Color color, float factor);
Color ColorLerp(Color color1, Color color2, float factor);
bool ColorIsEqual(Color col1, Color col2);

/* Text */
Font GetFontDefault(void);
Font LoadFont(const char *fileName);
void UnloadFont(Font font);
void DrawFPS(int posX, int posY);
void DrawText(const char *text, int posX, int posY, int fontSize, Color color);
void DrawTextEx(Font font, const char *text, Vector2 position, float fontSize, float spacing, Color tint);
void DrawTextPro(Font font, const char *text, Vector2 position, Vector2 origin, float rotation, float fontSize, float spacing, Color tint);
int MeasureText(const char *text, int fontSize);
Vector2 MeasureTextEx(Font font, const char *text, float fontSize, float spacing);
const char *TextFormat(const char *text, ...);
int TextLength(const char *text);
bool TextIsEqual(const char *text1, const char *text2);
const char *TextSubtext(const char *text, int position, int length);
int TextToInteger(const char *text);

/* 3D (not drawn in the browser version yet) */
void DrawGrid(int slices, float spacing);
void DrawCube(Vector3 position, float width, float height, float length, Color color);
void DrawCubeV(Vector3 position, Vector3 size, Color color);
void DrawCubeWires(Vector3 position, float width, float height, float length, Color color);
void DrawSphere(Vector3 centerPos, float radius, Color color);
void DrawPlane(Vector3 centerPos, Vector2 size, Color color);
void UpdateCamera(Camera *camera, int mode);

/* Audio (silent in the browser version) */
void InitAudioDevice(void);
void CloseAudioDevice(void);
bool IsAudioDeviceReady(void);
void SetMasterVolume(float volume);
Sound LoadSound(const char *fileName);
void UnloadSound(Sound sound);
void PlaySound(Sound sound);
void StopSound(Sound sound);
bool IsSoundPlaying(Sound sound);
void SetSoundVolume(Sound sound, float volume);
Music LoadMusicStream(const char *fileName);
void UnloadMusicStream(Music music);
void PlayMusicStream(Music music);
void StopMusicStream(Music music);
void UpdateMusicStream(Music music);
void SetMusicVolume(Music music, float volume);
#endif
`;

  const RAYMATH_H = String.raw`/* raymath.h (Smoki's Code): vector and math helpers from raylib */
#ifndef RAYMATH_H
#define RAYMATH_H
#include "raylib.h"
#include <math.h>
#define RMAPI static inline
#ifndef EPSILON
#define EPSILON 0.000001f
#endif
RMAPI float Clamp(float value, float min, float max) { float r = value < min ? min : value; return r > max ? max : r; }
RMAPI float Lerp(float start, float end, float amount) { return start + amount * (end - start); }
RMAPI float Normalize(float value, float start, float end) { return (value - start) / (end - start); }
RMAPI float Remap(float value, float inStart, float inEnd, float outStart, float outEnd) { return (value - inStart) / (inEnd - inStart) * (outEnd - outStart) + outStart; }
RMAPI float Wrap(float value, float min, float max) { return value - (max - min) * floorf((value - min) / (max - min)); }
RMAPI int FloatEquals(float x, float y) { return fabsf(x - y) <= EPSILON * fmaxf(1.0f, fmaxf(fabsf(x), fabsf(y))); }
RMAPI Vector2 Vector2Zero(void) { Vector2 r = { 0.0f, 0.0f }; return r; }
RMAPI Vector2 Vector2One(void) { Vector2 r = { 1.0f, 1.0f }; return r; }
RMAPI Vector2 Vector2Add(Vector2 a, Vector2 b) { Vector2 r = { a.x + b.x, a.y + b.y }; return r; }
RMAPI Vector2 Vector2AddValue(Vector2 v, float a) { Vector2 r = { v.x + a, v.y + a }; return r; }
RMAPI Vector2 Vector2Subtract(Vector2 a, Vector2 b) { Vector2 r = { a.x - b.x, a.y - b.y }; return r; }
RMAPI Vector2 Vector2SubtractValue(Vector2 v, float a) { Vector2 r = { v.x - a, v.y - a }; return r; }
RMAPI float Vector2Length(Vector2 v) { return sqrtf(v.x * v.x + v.y * v.y); }
RMAPI float Vector2LengthSqr(Vector2 v) { return v.x * v.x + v.y * v.y; }
RMAPI float Vector2DotProduct(Vector2 a, Vector2 b) { return a.x * b.x + a.y * b.y; }
RMAPI float Vector2Distance(Vector2 a, Vector2 b) { return sqrtf((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
RMAPI float Vector2DistanceSqr(Vector2 a, Vector2 b) { return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y); }
RMAPI float Vector2Angle(Vector2 a, Vector2 b) { return atan2f(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y); }
RMAPI Vector2 Vector2Scale(Vector2 v, float s) { Vector2 r = { v.x * s, v.y * s }; return r; }
RMAPI Vector2 Vector2Multiply(Vector2 a, Vector2 b) { Vector2 r = { a.x * b.x, a.y * b.y }; return r; }
RMAPI Vector2 Vector2Negate(Vector2 v) { Vector2 r = { -v.x, -v.y }; return r; }
RMAPI Vector2 Vector2Divide(Vector2 a, Vector2 b) { Vector2 r = { a.x / b.x, a.y / b.y }; return r; }
RMAPI Vector2 Vector2Normalize(Vector2 v) { float l = Vector2Length(v); Vector2 r = { 0.0f, 0.0f }; if (l > 0) { r.x = v.x / l; r.y = v.y / l; } return r; }
RMAPI Vector2 Vector2Lerp(Vector2 a, Vector2 b, float t) { Vector2 r = { a.x + t * (b.x - a.x), a.y + t * (b.y - a.y) }; return r; }
RMAPI Vector2 Vector2Rotate(Vector2 v, float angle) { float c = cosf(angle), s = sinf(angle); Vector2 r = { v.x * c - v.y * s, v.x * s + v.y * c }; return r; }
RMAPI Vector2 Vector2MoveTowards(Vector2 v, Vector2 target, float maxDistance) {
  float dx = target.x - v.x, dy = target.y - v.y, d = dx * dx + dy * dy;
  if (d == 0 || (maxDistance >= 0 && d <= maxDistance * maxDistance)) return target;
  float dist = sqrtf(d); Vector2 r = { v.x + dx / dist * maxDistance, v.y + dy / dist * maxDistance }; return r;
}
RMAPI Vector2 Vector2Clamp(Vector2 v, Vector2 min, Vector2 max) { Vector2 r = { fminf(max.x, fmaxf(min.x, v.x)), fminf(max.y, fmaxf(min.y, v.y)) }; return r; }
RMAPI int Vector2Equals(Vector2 p, Vector2 q) { return FloatEquals(p.x, q.x) && FloatEquals(p.y, q.y); }
RMAPI Vector3 Vector3Zero(void) { Vector3 r = { 0.0f, 0.0f, 0.0f }; return r; }
RMAPI Vector3 Vector3One(void) { Vector3 r = { 1.0f, 1.0f, 1.0f }; return r; }
RMAPI Vector3 Vector3Add(Vector3 a, Vector3 b) { Vector3 r = { a.x + b.x, a.y + b.y, a.z + b.z }; return r; }
RMAPI Vector3 Vector3Subtract(Vector3 a, Vector3 b) { Vector3 r = { a.x - b.x, a.y - b.y, a.z - b.z }; return r; }
RMAPI Vector3 Vector3Scale(Vector3 v, float s) { Vector3 r = { v.x * s, v.y * s, v.z * s }; return r; }
RMAPI Vector3 Vector3Multiply(Vector3 a, Vector3 b) { Vector3 r = { a.x * b.x, a.y * b.y, a.z * b.z }; return r; }
RMAPI Vector3 Vector3CrossProduct(Vector3 a, Vector3 b) { Vector3 r = { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x }; return r; }
RMAPI float Vector3Length(const Vector3 v) { return sqrtf(v.x * v.x + v.y * v.y + v.z * v.z); }
RMAPI float Vector3DotProduct(Vector3 a, Vector3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
RMAPI float Vector3Distance(Vector3 a, Vector3 b) { float dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; return sqrtf(dx * dx + dy * dy + dz * dz); }
RMAPI Vector3 Vector3Normalize(Vector3 v) { float l = Vector3Length(v); Vector3 r = v; if (l != 0.0f) { r.x /= l; r.y /= l; r.z /= l; } return r; }
RMAPI Vector3 Vector3Negate(Vector3 v) { Vector3 r = { -v.x, -v.y, -v.z }; return r; }
RMAPI Vector3 Vector3Lerp(Vector3 a, Vector3 b, float t) { Vector3 r = { a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), a.z + t * (b.z - a.z) }; return r; }
#endif
`;

  const RAYLIB_C = String.raw`/* raylib.c (Smoki's Code): raylib on top of the browser canvas */
#include "raylib.h"
#include "smoki_gfx.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

/* Canvas drawing in JavaScript (graphics.js). Colors are packed as 0xRRGGBBAA. */
void c2_clear(unsigned int color);
void c2_rect(float x, float y, float w, float h, float rotation, float ox, float oy, unsigned int color);
void c2_rect_lines(float x, float y, float w, float h, float thick, unsigned int color);
void c2_round_rect(float x, float y, float w, float h, float radius, float thick, unsigned int color);
void c2_gradient(float x, float y, float w, float h, unsigned int c1, unsigned int c2, int vertical);
void c2_circle(float x, float y, float r, float thick, unsigned int color);
void c2_circle_gradient(float x, float y, float r, unsigned int inner, unsigned int outer);
void c2_ellipse(float x, float y, float rx, float ry, float thick, unsigned int color);
void c2_sector(float x, float y, float r1, float r2, float a0, float a1, float thick, unsigned int color);
void c2_line(float x1, float y1, float x2, float y2, float thick, unsigned int color);
void c2_tri(float x1, float y1, float x2, float y2, float x3, float y3, float thick, unsigned int color);
void c2_poly(float x, float y, int sides, float r, float rotation, float thick, unsigned int color);
void c2_text(const char *text, float x, float y, float size, float spacing, float rotation, unsigned int color);
int c2_measure(const char *text, float size, float spacing);
void c2_camera(float ox, float oy, float tx, float ty, float rotation, float zoom);
void c2_reset(void);
void c2_clip(int x, int y, int w, int h);
void c2_unclip(void);
void c2_blend(int mode);
void c2_texture(unsigned int id, float sx, float sy, float sw, float sh, float dx, float dy, float dw, float dh, float ox, float oy, float rotation, unsigned int tint);

static int screenW = 800, screenH = 450, ready = 0, exitKey = KEY_ESCAPE;
static unsigned int P(Color c) { return ((unsigned int)c.r << 24) | ((unsigned int)c.g << 16) | ((unsigned int)c.b << 8) | (unsigned int)c.a; }
static void warnOnce(int *flag, const char *text) { if (!*flag) { *flag = 1; sg_warn(text); } }
static int w3d, wtex, waudio, wfont;

void InitWindow(int width, int height, const char *title) { screenW = width; screenH = height; ready = 1; sg_window(width, height, title ? title : "raylib"); }
void CloseWindow(void) { ready = 0; sg_close(); }
bool WindowShouldClose(void) { if (exitKey != KEY_NULL && (sg_key(exitKey) & 2)) return true; return sg_should_close() != 0; }
bool IsWindowReady(void) { return ready; }
bool IsWindowFocused(void) { return true; }
bool IsWindowResized(void) { return false; }
void SetWindowTitle(const char *title) { sg_title(title); }
void SetWindowSize(int width, int height) { screenW = width; screenH = height; sg_window(width, height, 0); }
void SetWindowPosition(int x, int y) {}
void SetWindowMinSize(int width, int height) {}
void SetConfigFlags(unsigned int flags) {}
void SetWindowState(unsigned int flags) {}
void ClearWindowState(unsigned int flags) {}
void ToggleFullscreen(void) {}
int GetScreenWidth(void) { return screenW; }
int GetScreenHeight(void) { return screenH; }
int GetRenderWidth(void) { return screenW; }
int GetRenderHeight(void) { return screenH; }
int GetMonitorWidth(int monitor) { return 1920; }
int GetMonitorHeight(int monitor) { return 1080; }
void SetExitKey(int key) { exitKey = key; }
void ShowCursor(void) {}
void HideCursor(void) {}
void DisableCursor(void) {}
void EnableCursor(void) {}
void SetMouseCursor(int cursor) {}

void ClearBackground(Color color) { c2_clear(P(color)); }
void BeginDrawing(void) {}
void EndDrawing(void) { c2_reset(); sg_frame(); }
void BeginMode2D(Camera2D cam) { c2_camera(cam.offset.x, cam.offset.y, cam.target.x, cam.target.y, cam.rotation, cam.zoom); }
void EndMode2D(void) { c2_reset(); }
void BeginMode3D(Camera3D camera) { warnOnce(&w3d, "raylib 3D drawing (BeginMode3D, DrawCube...) is not shown in the browser version yet."); }
void EndMode3D(void) {}
void BeginScissorMode(int x, int y, int width, int height) { c2_clip(x, y, width, height); }
void EndScissorMode(void) { c2_unclip(); }
void BeginBlendMode(int mode) { c2_blend(mode); }
void EndBlendMode(void) { c2_blend(0); }

void SetTargetFPS(int fps) { sg_fps(fps); }
float GetFrameTime(void) { return sg_frame_time(); }
double GetTime(void) { return sg_time(); }
int GetFPS(void) { return sg_get_fps(); }
void WaitTime(double seconds) { double end = sg_time() + seconds; while (sg_time() < end) {} }

void SetRandomSeed(unsigned int seed) { srand(seed); }
int GetRandomValue(int min, int max) { if (min > max) { int t = min; min = max; max = t; } return min + rand() % (max - min + 1); }
void TraceLog(int logLevel, const char *text, ...) {
  static const char *names[] = { "", "TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "FATAL", "" };
  char buf[1024]; va_list ap; va_start(ap, text); vsnprintf(buf, sizeof buf, text, ap); va_end(ap);
  printf("%s: %s\n", (logLevel >= 0 && logLevel <= 7) ? names[logLevel] : "", buf);
  if (logLevel == LOG_FATAL) exit(1);
}
void SetTraceLogLevel(int logLevel) {}
void TakeScreenshot(const char *fileName) {}
void OpenURL(const char *url) {}

bool IsKeyPressed(int key) { return (sg_key(key) & 2) != 0; }
bool IsKeyPressedRepeat(int key) { return (sg_key(key) & 8) != 0; }
bool IsKeyDown(int key) { return (sg_key(key) & 1) != 0; }
bool IsKeyReleased(int key) { return (sg_key(key) & 4) != 0; }
bool IsKeyUp(int key) { return (sg_key(key) & 1) == 0; }
int GetKeyPressed(void) { return sg_next_key(); }
int GetCharPressed(void) { return sg_next_char(); }
bool IsMouseButtonPressed(int button) { return (sg_mouse_button(button) & 2) != 0; }
bool IsMouseButtonDown(int button) { return (sg_mouse_button(button) & 1) != 0; }
bool IsMouseButtonReleased(int button) { return (sg_mouse_button(button) & 4) != 0; }
bool IsMouseButtonUp(int button) { return (sg_mouse_button(button) & 1) == 0; }
int GetMouseX(void) { return sg_mouse_x(); }
int GetMouseY(void) { return sg_mouse_y(); }
Vector2 GetMousePosition(void) { Vector2 v = { (float)sg_mouse_x(), (float)sg_mouse_y() }; return v; }
Vector2 GetMouseDelta(void) {
  static int lastX, lastY; int x = sg_mouse_x(), y = sg_mouse_y();
  Vector2 v = { (float)(x - lastX), (float)(y - lastY) }; lastX = x; lastY = y; return v;
}
void SetMousePosition(int x, int y) {}
float GetMouseWheelMove(void) { return sg_wheel(); }
Vector2 GetMouseWheelMoveV(void) { Vector2 v = { 0.0f, sg_wheel() }; return v; }
int GetTouchX(void) { return sg_mouse_x(); }
int GetTouchY(void) { return sg_mouse_y(); }
Vector2 GetTouchPosition(int index) { return GetMousePosition(); }
int GetTouchPointCount(void) { return (sg_mouse_button(0) & 1) ? 1 : 0; }

void DrawPixel(int x, int y, Color c) { c2_rect((float)x, (float)y, 1, 1, 0, 0, 0, P(c)); }
void DrawPixelV(Vector2 p, Color c) { c2_rect(p.x, p.y, 1, 1, 0, 0, 0, P(c)); }
void DrawLine(int x1, int y1, int x2, int y2, Color c) { c2_line(x1 + 0.5f, y1 + 0.5f, x2 + 0.5f, y2 + 0.5f, 1, P(c)); }
void DrawLineV(Vector2 a, Vector2 b, Color c) { c2_line(a.x, a.y, b.x, b.y, 1, P(c)); }
void DrawLineEx(Vector2 a, Vector2 b, float thick, Color c) { c2_line(a.x, a.y, b.x, b.y, thick, P(c)); }
void DrawLineStrip(const Vector2 *pts, int n, Color c) { for (int i = 0; i + 1 < n; i++) c2_line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, 1, P(c)); }
void DrawLineBezier(Vector2 a, Vector2 b, float thick, Color c) {
  Vector2 prev = a;
  for (int i = 1; i <= 24; i++) {
    float t = i / 24.0f, e = t < 0.5f ? 4 * t * t * t : 1 - powf(-2 * t + 2, 3) / 2;
    Vector2 cur = { a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * e };
    c2_line(prev.x, prev.y, cur.x, cur.y, thick, P(c)); prev = cur;
  }
}
void DrawCircle(int x, int y, float r, Color c) { c2_circle((float)x, (float)y, r, 0, P(c)); }
void DrawCircleV(Vector2 p, float r, Color c) { c2_circle(p.x, p.y, r, 0, P(c)); }
void DrawCircleSector(Vector2 p, float r, float a0, float a1, int segments, Color c) { c2_sector(p.x, p.y, 0, r, a0, a1, 0, P(c)); }
void DrawCircleSectorLines(Vector2 p, float r, float a0, float a1, int segments, Color c) { c2_sector(p.x, p.y, 0, r, a0, a1, 1, P(c)); }
void DrawCircleGradient(int x, int y, float r, Color inner, Color outer) { c2_circle_gradient((float)x, (float)y, r, P(inner), P(outer)); }
void DrawCircleLines(int x, int y, float r, Color c) { c2_circle((float)x, (float)y, r, 1, P(c)); }
void DrawCircleLinesV(Vector2 p, float r, Color c) { c2_circle(p.x, p.y, r, 1, P(c)); }
void DrawEllipse(int x, int y, float rx, float ry, Color c) { c2_ellipse((float)x, (float)y, rx, ry, 0, P(c)); }
void DrawEllipseLines(int x, int y, float rx, float ry, Color c) { c2_ellipse((float)x, (float)y, rx, ry, 1, P(c)); }
void DrawRing(Vector2 p, float r1, float r2, float a0, float a1, int segments, Color c) { c2_sector(p.x, p.y, r1, r2, a0, a1, 0, P(c)); }
void DrawRingLines(Vector2 p, float r1, float r2, float a0, float a1, int segments, Color c) { c2_sector(p.x, p.y, r1, r2, a0, a1, 1, P(c)); }
void DrawRectangle(int x, int y, int w, int h, Color c) { c2_rect((float)x, (float)y, (float)w, (float)h, 0, 0, 0, P(c)); }
void DrawRectangleV(Vector2 p, Vector2 s, Color c) { c2_rect(p.x, p.y, s.x, s.y, 0, 0, 0, P(c)); }
void DrawRectangleRec(Rectangle r, Color c) { c2_rect(r.x, r.y, r.width, r.height, 0, 0, 0, P(c)); }
void DrawRectanglePro(Rectangle r, Vector2 o, float rot, Color c) { c2_rect(r.x, r.y, r.width, r.height, rot, o.x, o.y, P(c)); }
void DrawRectangleGradientV(int x, int y, int w, int h, Color top, Color bottom) { c2_gradient((float)x, (float)y, (float)w, (float)h, P(top), P(bottom), 1); }
void DrawRectangleGradientH(int x, int y, int w, int h, Color left, Color right) { c2_gradient((float)x, (float)y, (float)w, (float)h, P(left), P(right), 0); }
void DrawRectangleGradientEx(Rectangle r, Color tl, Color bl, Color tr, Color br) { c2_gradient(r.x, r.y, r.width, r.height, P(tl), P(br), 2); }
void DrawRectangleLines(int x, int y, int w, int h, Color c) { c2_rect_lines((float)x, (float)y, (float)w, (float)h, 1, P(c)); }
void DrawRectangleLinesEx(Rectangle r, float thick, Color c) { c2_rect_lines(r.x, r.y, r.width, r.height, thick, P(c)); }
static float radiusOf(Rectangle r, float roundness) { float m = r.width < r.height ? r.width : r.height; return roundness * m / 2; }
void DrawRectangleRounded(Rectangle r, float roundness, int segments, Color c) { c2_round_rect(r.x, r.y, r.width, r.height, radiusOf(r, roundness), 0, P(c)); }
void DrawRectangleRoundedLines(Rectangle r, float roundness, int segments, Color c) { c2_round_rect(r.x, r.y, r.width, r.height, radiusOf(r, roundness), 1, P(c)); }
void DrawRectangleRoundedLinesEx(Rectangle r, float roundness, int segments, float thick, Color c) { c2_round_rect(r.x, r.y, r.width, r.height, radiusOf(r, roundness), thick, P(c)); }
void DrawTriangle(Vector2 a, Vector2 b, Vector2 c3, Color c) { c2_tri(a.x, a.y, b.x, b.y, c3.x, c3.y, 0, P(c)); }
void DrawTriangleLines(Vector2 a, Vector2 b, Vector2 c3, Color c) { c2_tri(a.x, a.y, b.x, b.y, c3.x, c3.y, 1, P(c)); }
void DrawTriangleFan(const Vector2 *p, int n, Color c) { for (int i = 1; i + 1 < n; i++) c2_tri(p[0].x, p[0].y, p[i].x, p[i].y, p[i + 1].x, p[i + 1].y, 0, P(c)); }
void DrawTriangleStrip(const Vector2 *p, int n, Color c) { for (int i = 0; i + 2 < n; i++) c2_tri(p[i].x, p[i].y, p[i + 1].x, p[i + 1].y, p[i + 2].x, p[i + 2].y, 0, P(c)); }
void DrawPoly(Vector2 p, int sides, float r, float rot, Color c) { c2_poly(p.x, p.y, sides, r, rot, 0, P(c)); }
void DrawPolyLines(Vector2 p, int sides, float r, float rot, Color c) { c2_poly(p.x, p.y, sides, r, rot, 1, P(c)); }
void DrawPolyLinesEx(Vector2 p, int sides, float r, float rot, float thick, Color c) { c2_poly(p.x, p.y, sides, r, rot, thick, P(c)); }

bool CheckCollisionRecs(Rectangle a, Rectangle b) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }
bool CheckCollisionCircles(Vector2 c1, float r1, Vector2 c2, float r2) { float dx = c2.x - c1.x, dy = c2.y - c1.y; return dx * dx + dy * dy <= (r1 + r2) * (r1 + r2); }
bool CheckCollisionCircleRec(Vector2 c, float r, Rectangle rec) {
  float cx = c.x < rec.x ? rec.x : (c.x > rec.x + rec.width ? rec.x + rec.width : c.x);
  float cy = c.y < rec.y ? rec.y : (c.y > rec.y + rec.height ? rec.y + rec.height : c.y);
  float dx = c.x - cx, dy = c.y - cy; return dx * dx + dy * dy <= r * r;
}
bool CheckCollisionPointRec(Vector2 p, Rectangle r) { return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height; }
bool CheckCollisionPointCircle(Vector2 p, Vector2 c, float r) { float dx = p.x - c.x, dy = p.y - c.y; return dx * dx + dy * dy <= r * r; }
bool CheckCollisionPointTriangle(Vector2 p, Vector2 a, Vector2 b, Vector2 c) {
  float alpha = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / ((b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y));
  float beta = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / ((b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y));
  float gamma = 1.0f - alpha - beta; return alpha > 0 && beta > 0 && gamma > 0;
}
bool CheckCollisionLines(Vector2 s1, Vector2 e1, Vector2 s2, Vector2 e2, Vector2 *cp) {
  float div = (e2.y - s2.y) * (e1.x - s1.x) - (e2.x - s2.x) * (e1.y - s1.y);
  if (fabsf(div) < 0.0001f) return false;
  float xi = ((s2.x - e2.x) * (s1.x * e1.y - s1.y * e1.x) - (s1.x - e1.x) * (s2.x * e2.y - s2.y * e2.x)) / div;
  float yi = ((s2.y - e2.y) * (s1.x * e1.y - s1.y * e1.x) - (s1.y - e1.y) * (s2.x * e2.y - s2.y * e2.x)) / div;
  if ((fabsf(s1.x - e1.x) > 0.0001f && (xi < fminf(s1.x, e1.x) || xi > fmaxf(s1.x, e1.x))) ||
      (fabsf(s2.x - e2.x) > 0.0001f && (xi < fminf(s2.x, e2.x) || xi > fmaxf(s2.x, e2.x))) ||
      (fabsf(s1.y - e1.y) > 0.0001f && (yi < fminf(s1.y, e1.y) || yi > fmaxf(s1.y, e1.y))) ||
      (fabsf(s2.y - e2.y) > 0.0001f && (yi < fminf(s2.y, e2.y) || yi > fmaxf(s2.y, e2.y)))) return false;
  if (cp) { cp->x = xi; cp->y = yi; }
  return true;
}
Rectangle GetCollisionRec(Rectangle a, Rectangle b) {
  Rectangle r = { 0, 0, 0, 0 };
  float left = fmaxf(a.x, b.x), right = fminf(a.x + a.width, b.x + b.width), top = fmaxf(a.y, b.y), bottom = fminf(a.y + a.height, b.y + b.height);
  if (left < right && top < bottom) { r.x = left; r.y = top; r.width = right - left; r.height = bottom - top; }
  return r;
}

Image LoadImage(const char *fileName) { Image img = { 0, 0, 0, 1, 7 }; warnOnce(&wtex, "Pictures are not loaded in the browser version; textures draw as a magenta box."); return img; }
Image GenImageColor(int w, int h, Color c) { Image img = { 0, w, h, 1, 7 }; return img; }
void UnloadImage(Image image) {}
Texture2D LoadTexture(const char *fileName) { Texture2D t = { 0, 64, 64, 1, 7 }; warnOnce(&wtex, "Pictures are not loaded in the browser version; textures draw as a magenta box."); return t; }
Texture2D LoadTextureFromImage(Image image) { Texture2D t = { 0, image.width ? image.width : 64, image.height ? image.height : 64, 1, 7 }; return t; }
void UnloadTexture(Texture2D t) {}
bool IsTextureReady(Texture2D t) { return true; }
void DrawTexture(Texture2D t, int x, int y, Color tint) { c2_texture(t.id, 0, 0, (float)t.width, (float)t.height, (float)x, (float)y, (float)t.width, (float)t.height, 0, 0, 0, P(tint)); }
void DrawTextureV(Texture2D t, Vector2 p, Color tint) { DrawTexture(t, (int)p.x, (int)p.y, tint); }
void DrawTextureEx(Texture2D t, Vector2 p, float rot, float scale, Color tint) { c2_texture(t.id, 0, 0, (float)t.width, (float)t.height, p.x, p.y, t.width * scale, t.height * scale, 0, 0, rot, P(tint)); }
void DrawTextureRec(Texture2D t, Rectangle s, Vector2 p, Color tint) { c2_texture(t.id, s.x, s.y, s.width, s.height, p.x, p.y, fabsf(s.width), fabsf(s.height), 0, 0, 0, P(tint)); }
void DrawTexturePro(Texture2D t, Rectangle s, Rectangle d, Vector2 o, float rot, Color tint) { c2_texture(t.id, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height, o.x, o.y, rot, P(tint)); }
RenderTexture2D LoadRenderTexture(int w, int h) { RenderTexture2D r; memset(&r, 0, sizeof r); r.texture.width = w; r.texture.height = h; return r; }
void UnloadRenderTexture(RenderTexture2D target) {}
void BeginTextureMode(RenderTexture2D target) {}
void EndTextureMode(void) {}

Color Fade(Color c, float alpha) { if (alpha < 0) alpha = 0; if (alpha > 1) alpha = 1; c.a = (unsigned char)(255.0f * alpha); return c; }
Color ColorAlpha(Color c, float alpha) { return Fade(c, alpha); }
int ColorToInt(Color c) { return (int)P(c); }
Color GetColor(unsigned int hex) { Color c = { (unsigned char)(hex >> 24), (unsigned char)(hex >> 16), (unsigned char)(hex >> 8), (unsigned char)hex }; return c; }
Color ColorFromHSV(float hue, float s, float v) {
  Color c = { 0, 0, 0, 255 };
  float k = fmodf(5.0f + hue / 60.0f, 6); float t = 4.0f - k; k = (t < k) ? t : k; k = (k < 1) ? k : 1; k = (k > 0) ? k : 0; c.r = (unsigned char)((v - v * s * k) * 255.0f);
  k = fmodf(3.0f + hue / 60.0f, 6); t = 4.0f - k; k = (t < k) ? t : k; k = (k < 1) ? k : 1; k = (k > 0) ? k : 0; c.g = (unsigned char)((v - v * s * k) * 255.0f);
  k = fmodf(1.0f + hue / 60.0f, 6); t = 4.0f - k; k = (t < k) ? t : k; k = (k < 1) ? k : 1; k = (k > 0) ? k : 0; c.b = (unsigned char)((v - v * s * k) * 255.0f);
  return c;
}
Vector3 ColorToHSV(Color c) {
  Vector3 hsv = { 0, 0, 0 }; float r = c.r / 255.0f, g = c.g / 255.0f, b = c.b / 255.0f;
  float min = fminf(r, fminf(g, b)), max = fmaxf(r, fmaxf(g, b)), delta = max - min;
  hsv.z = max; if (delta < 0.00001f || max <= 0) return hsv;
  hsv.y = delta / max;
  if (r >= max) hsv.x = (g - b) / delta; else if (g >= max) hsv.x = 2.0f + (b - r) / delta; else hsv.x = 4.0f + (r - g) / delta;
  hsv.x *= 60.0f; if (hsv.x < 0) hsv.x += 360.0f; return hsv;
}
Color ColorBrightness(Color c, float f) {
  float r = c.r, g = c.g, b = c.b;
  if (f > 1) f = 1; if (f < -1) f = -1;
  if (f < 0) { f = 1 + f; r *= f; g *= f; b *= f; } else { r = (255 - r) * f + r; g = (255 - g) * f + g; b = (255 - b) * f + b; }
  Color o = { (unsigned char)r, (unsigned char)g, (unsigned char)b, c.a }; return o;
}
Color ColorLerp(Color a, Color b, float t) { Color o = { (unsigned char)(a.r + (b.r - a.r) * t), (unsigned char)(a.g + (b.g - a.g) * t), (unsigned char)(a.b + (b.b - a.b) * t), (unsigned char)(a.a + (b.a - a.a) * t) }; return o; }
bool ColorIsEqual(Color a, Color b) { return a.r == b.r && a.g == b.g && a.b == b.b && a.a == b.a; }

Font GetFontDefault(void) { Font f; memset(&f, 0, sizeof f); f.baseSize = 10; return f; }
Font LoadFont(const char *fileName) { warnOnce(&wfont, "Font files are not loaded in the browser version; the default font is used."); return GetFontDefault(); }
void UnloadFont(Font font) {}
void DrawFPS(int x, int y) {
  int fps = sg_get_fps(); Color c = LIME; if (fps < 30 && fps >= 15) c = ORANGE; else if (fps < 15) c = RED;
  DrawText(TextFormat("%2i FPS", fps), x, y, 20, c);
}
void DrawText(const char *text, int x, int y, int size, Color c) { if (size < 10) size = 10; c2_text(text, (float)x, (float)y, (float)size, size / 10.0f, 0, P(c)); }
void DrawTextEx(Font f, const char *text, Vector2 p, float size, float spacing, Color c) { c2_text(text, p.x, p.y, size, spacing, 0, P(c)); }
void DrawTextPro(Font f, const char *text, Vector2 p, Vector2 o, float rot, float size, float spacing, Color c) { c2_text(text, p.x - o.x, p.y - o.y, size, spacing, rot, P(c)); }
int MeasureText(const char *text, int size) { if (size < 10) size = 10; return c2_measure(text, (float)size, size / 10.0f); }
Vector2 MeasureTextEx(Font f, const char *text, float size, float spacing) { Vector2 v = { (float)c2_measure(text, size, spacing), size }; return v; }
const char *TextFormat(const char *text, ...) {
  static char bufs[4][1024]; static int i = 0; i = (i + 1) % 4;
  va_list ap; va_start(ap, text); vsnprintf(bufs[i], 1024, text, ap); va_end(ap); return bufs[i];
}
int TextLength(const char *text) { return text ? (int)strlen(text) : 0; }
bool TextIsEqual(const char *a, const char *b) { return a && b && strcmp(a, b) == 0; }
const char *TextSubtext(const char *text, int pos, int len) {
  static char buf[1024]; int n = (int)strlen(text); if (pos >= n) { buf[0] = 0; return buf; }
  if (len > n - pos) len = n - pos; if (len > 1023) len = 1023; memcpy(buf, text + pos, len); buf[len] = 0; return buf;
}
int TextToInteger(const char *text) { return atoi(text); }

void DrawGrid(int slices, float spacing) { BeginMode3D((Camera3D){ 0 }); }
void DrawCube(Vector3 p, float w, float h, float l, Color c) { BeginMode3D((Camera3D){ 0 }); }
void DrawCubeV(Vector3 p, Vector3 s, Color c) { BeginMode3D((Camera3D){ 0 }); }
void DrawCubeWires(Vector3 p, float w, float h, float l, Color c) { BeginMode3D((Camera3D){ 0 }); }
void DrawSphere(Vector3 p, float r, Color c) { BeginMode3D((Camera3D){ 0 }); }
void DrawPlane(Vector3 p, Vector2 s, Color c) { BeginMode3D((Camera3D){ 0 }); }
void UpdateCamera(Camera *camera, int mode) {}

void InitAudioDevice(void) { warnOnce(&waudio, "Sound is not played in the browser version."); }
void CloseAudioDevice(void) {}
bool IsAudioDeviceReady(void) { return true; }
void SetMasterVolume(float volume) {}
Sound LoadSound(const char *fileName) { Sound s = { 0, 0 }; return s; }
void UnloadSound(Sound sound) {}
void PlaySound(Sound sound) {}
void StopSound(Sound sound) {}
bool IsSoundPlaying(Sound sound) { return false; }
void SetSoundVolume(Sound sound, float volume) {}
Music LoadMusicStream(const char *fileName) { Music m = { 0, false, 0 }; return m; }
void UnloadMusicStream(Music music) {}
void PlayMusicStream(Music music) {}
void StopMusicStream(Music music) {}
void UpdateMusicStream(Music music) {}
void SetMusicVolume(Music music, float volume) {}
`;

  /* ---------------------------------------------------------------- OpenGL */
  const GL_H = String.raw`/* GL/gl.h (Smoki's Code): OpenGL 1.x and 3.x calls, drawn with WebGL 2 */
#ifndef __gl_h_
#define __gl_h_
#define __GL_H__
#define GL_GLEXT_PROTOTYPES 1
typedef unsigned int GLenum;
typedef unsigned char GLboolean;
typedef unsigned int GLbitfield;
typedef void GLvoid;
typedef signed char GLbyte;
typedef short GLshort;
typedef int GLint;
typedef int GLsizei;
typedef unsigned char GLubyte;
typedef unsigned short GLushort;
typedef unsigned int GLuint;
typedef float GLfloat;
typedef float GLclampf;
typedef double GLdouble;
typedef double GLclampd;
typedef char GLchar;
typedef long GLsizeiptr;
typedef long GLintptr;
#define APIENTRY
#define GLAPIENTRY
#define GLAPI extern
#define WINGDIAPI

#define GL_FALSE 0
#define GL_TRUE 1
#define GL_NO_ERROR 0
#define GL_POINTS 0x0000
#define GL_LINES 0x0001
#define GL_LINE_LOOP 0x0002
#define GL_LINE_STRIP 0x0003
#define GL_TRIANGLES 0x0004
#define GL_TRIANGLE_STRIP 0x0005
#define GL_TRIANGLE_FAN 0x0006
#define GL_QUADS 0x0007
#define GL_QUAD_STRIP 0x0008
#define GL_POLYGON 0x0009
#define GL_DEPTH_BUFFER_BIT 0x00000100
#define GL_STENCIL_BUFFER_BIT 0x00000400
#define GL_COLOR_BUFFER_BIT 0x00004000
#define GL_MODELVIEW 0x1700
#define GL_PROJECTION 0x1701
#define GL_TEXTURE 0x1702
#define GL_DEPTH_TEST 0x0B71
#define GL_CULL_FACE 0x0B44
#define GL_BLEND 0x0BE2
#define GL_LIGHTING 0x0B50
#define GL_LIGHT0 0x4000
#define GL_LIGHT1 0x4001
#define GL_COLOR_MATERIAL 0x0B57
#define GL_NORMALIZE 0x0BA1
#define GL_SMOOTH 0x1D01
#define GL_FLAT 0x1D00
#define GL_TEXTURE_2D 0x0DE1
#define GL_SCISSOR_TEST 0x0C11
#define GL_LINE_SMOOTH 0x0B20
#define GL_POINT_SMOOTH 0x0B10
#define GL_POLYGON_SMOOTH 0x0B41
#define GL_MULTISAMPLE 0x809D
#define GL_FRONT 0x0404
#define GL_BACK 0x0405
#define GL_FRONT_AND_BACK 0x0408
#define GL_CW 0x0900
#define GL_CCW 0x0901
#define GL_LINE 0x1B01
#define GL_FILL 0x1B02
#define GL_POINT 0x1B00
#define GL_NEVER 0x0200
#define GL_LESS 0x0201
#define GL_EQUAL 0x0202
#define GL_LEQUAL 0x0203
#define GL_GREATER 0x0204
#define GL_NOTEQUAL 0x0205
#define GL_GEQUAL 0x0206
#define GL_ALWAYS 0x0207
#define GL_ZERO 0
#define GL_ONE 1
#define GL_SRC_COLOR 0x0300
#define GL_ONE_MINUS_SRC_COLOR 0x0301
#define GL_SRC_ALPHA 0x0302
#define GL_ONE_MINUS_SRC_ALPHA 0x0303
#define GL_DST_ALPHA 0x0304
#define GL_ONE_MINUS_DST_ALPHA 0x0305
#define GL_DST_COLOR 0x0306
#define GL_ONE_MINUS_DST_COLOR 0x0307
#define GL_AMBIENT 0x1200
#define GL_DIFFUSE 0x1201
#define GL_SPECULAR 0x1202
#define GL_POSITION 0x1203
#define GL_SHININESS 0x1601
#define GL_AMBIENT_AND_DIFFUSE 0x1602
#define GL_EMISSION 0x1600
#define GL_LINE_WIDTH 0x0B21
#define GL_POINT_SIZE 0x0B11
#define GL_VIEWPORT 0x0BA2
#define GL_BYTE 0x1400
#define GL_UNSIGNED_BYTE 0x1401
#define GL_SHORT 0x1402
#define GL_UNSIGNED_SHORT 0x1403
#define GL_INT 0x1404
#define GL_UNSIGNED_INT 0x1405
#define GL_FLOAT 0x1406
#define GL_DOUBLE 0x140A
#define GL_RED 0x1903
#define GL_ALPHA 0x1906
#define GL_RGB 0x1907
#define GL_RGBA 0x1908
#define GL_LUMINANCE 0x1909
#define GL_RGB8 0x8051
#define GL_RGBA8 0x8058
#define GL_NEAREST 0x2600
#define GL_LINEAR 0x2601
#define GL_NEAREST_MIPMAP_NEAREST 0x2700
#define GL_LINEAR_MIPMAP_NEAREST 0x2701
#define GL_NEAREST_MIPMAP_LINEAR 0x2702
#define GL_LINEAR_MIPMAP_LINEAR 0x2703
#define GL_TEXTURE_MAG_FILTER 0x2800
#define GL_TEXTURE_MIN_FILTER 0x2801
#define GL_TEXTURE_WRAP_S 0x2802
#define GL_TEXTURE_WRAP_T 0x2803
#define GL_REPEAT 0x2901
#define GL_CLAMP 0x2900
#define GL_CLAMP_TO_EDGE 0x812F
#define GL_MIRRORED_REPEAT 0x8370
#define GL_UNPACK_ALIGNMENT 0x0CF5
#define GL_VENDOR 0x1F00
#define GL_RENDERER 0x1F01
#define GL_VERSION 0x1F02
#define GL_EXTENSIONS 0x1F03
#define GL_SHADING_LANGUAGE_VERSION 0x8B8C
#define GL_ARRAY_BUFFER 0x8892
#define GL_ELEMENT_ARRAY_BUFFER 0x8893
#define GL_UNIFORM_BUFFER 0x8A11
#define GL_STREAM_DRAW 0x88E0
#define GL_STATIC_DRAW 0x88E4
#define GL_DYNAMIC_DRAW 0x88E8
#define GL_FRAGMENT_SHADER 0x8B30
#define GL_VERTEX_SHADER 0x8B31
#define GL_COMPILE_STATUS 0x8B81
#define GL_LINK_STATUS 0x8B82
#define GL_VALIDATE_STATUS 0x8B83
#define GL_INFO_LOG_LENGTH 0x8B84
#define GL_TEXTURE0 0x84C0
#define GL_TEXTURE1 0x84C1
#define GL_TEXTURE2 0x84C2
#define GL_TEXTURE3 0x84C3
#define GL_FRAMEBUFFER 0x8D40
#define GL_RENDERBUFFER 0x8D41
#define GL_COLOR_ATTACHMENT0 0x8CE0
#define GL_DEPTH_ATTACHMENT 0x8D00
#define GL_DEPTH_STENCIL_ATTACHMENT 0x821A
#define GL_DEPTH24_STENCIL8 0x88F0
#define GL_FRAMEBUFFER_COMPLETE 0x8CD5
#define GL_PROGRAM_POINT_SIZE 0x8642
#define GL_MAX_VERTEX_ATTRIBS 0x8869

/* OpenGL 1.x */
void glClearColor(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha);
void glClear(GLbitfield mask);
void glClearDepth(GLdouble depth);
void glClearDepthf(GLfloat depth);
void glViewport(GLint x, GLint y, GLsizei width, GLsizei height);
void glScissor(GLint x, GLint y, GLsizei width, GLsizei height);
void glEnable(GLenum cap);
void glDisable(GLenum cap);
GLboolean glIsEnabled(GLenum cap);
void glBlendFunc(GLenum sfactor, GLenum dfactor);
void glDepthFunc(GLenum func);
void glDepthMask(GLboolean flag);
void glCullFace(GLenum mode);
void glFrontFace(GLenum mode);
void glPolygonMode(GLenum face, GLenum mode);
void glShadeModel(GLenum mode);
void glLineWidth(GLfloat width);
void glPointSize(GLfloat size);
void glHint(GLenum target, GLenum mode);
void glFlush(void);
void glFinish(void);
GLenum glGetError(void);
const GLubyte *glGetString(GLenum name);
void glGetIntegerv(GLenum pname, GLint *data);
void glGetFloatv(GLenum pname, GLfloat *data);
void glPixelStorei(GLenum pname, GLint param);
void glBegin(GLenum mode);
void glEnd(void);
void glVertex2f(GLfloat x, GLfloat y);
void glVertex2i(GLint x, GLint y);
void glVertex2d(GLdouble x, GLdouble y);
void glVertex3f(GLfloat x, GLfloat y, GLfloat z);
void glVertex3i(GLint x, GLint y, GLint z);
void glVertex3d(GLdouble x, GLdouble y, GLdouble z);
void glVertex2fv(const GLfloat *v);
void glVertex3fv(const GLfloat *v);
void glColor3f(GLfloat r, GLfloat g, GLfloat b);
void glColor4f(GLfloat r, GLfloat g, GLfloat b, GLfloat a);
void glColor3d(GLdouble r, GLdouble g, GLdouble b);
void glColor4d(GLdouble r, GLdouble g, GLdouble b, GLdouble a);
void glColor3ub(GLubyte r, GLubyte g, GLubyte b);
void glColor4ub(GLubyte r, GLubyte g, GLubyte b, GLubyte a);
void glColor3fv(const GLfloat *v);
void glColor4fv(const GLfloat *v);
void glColor3i(GLint r, GLint g, GLint b);
void glNormal3f(GLfloat x, GLfloat y, GLfloat z);
void glNormal3d(GLdouble x, GLdouble y, GLdouble z);
void glNormal3fv(const GLfloat *v);
void glTexCoord2f(GLfloat s, GLfloat t);
void glRectf(GLfloat x1, GLfloat y1, GLfloat x2, GLfloat y2);
void glRecti(GLint x1, GLint y1, GLint x2, GLint y2);
void glMatrixMode(GLenum mode);
void glLoadIdentity(void);
void glPushMatrix(void);
void glPopMatrix(void);
void glTranslatef(GLfloat x, GLfloat y, GLfloat z);
void glTranslated(GLdouble x, GLdouble y, GLdouble z);
void glRotatef(GLfloat angle, GLfloat x, GLfloat y, GLfloat z);
void glRotated(GLdouble angle, GLdouble x, GLdouble y, GLdouble z);
void glScalef(GLfloat x, GLfloat y, GLfloat z);
void glScaled(GLdouble x, GLdouble y, GLdouble z);
void glOrtho(GLdouble left, GLdouble right, GLdouble bottom, GLdouble top, GLdouble zNear, GLdouble zFar);
void glFrustum(GLdouble left, GLdouble right, GLdouble bottom, GLdouble top, GLdouble zNear, GLdouble zFar);
void glLoadMatrixf(const GLfloat *m);
void glMultMatrixf(const GLfloat *m);
void glLightfv(GLenum light, GLenum pname, const GLfloat *params);
void glLightf(GLenum light, GLenum pname, GLfloat param);
void glMaterialfv(GLenum face, GLenum pname, const GLfloat *params);
void glMaterialf(GLenum face, GLenum pname, GLfloat param);
void glColorMaterial(GLenum face, GLenum mode);
void glRasterPos2f(GLfloat x, GLfloat y);
void glRasterPos2i(GLint x, GLint y);

/* Textures */
void glGenTextures(GLsizei n, GLuint *textures);
void glDeleteTextures(GLsizei n, const GLuint *textures);
void glBindTexture(GLenum target, GLuint texture);
void glTexImage2D(GLenum target, GLint level, GLint internalformat, GLsizei width, GLsizei height, GLint border, GLenum format, GLenum type, const void *pixels);
void glTexParameteri(GLenum target, GLenum pname, GLint param);
void glTexParameterf(GLenum target, GLenum pname, GLfloat param);
void glActiveTexture(GLenum texture);
void glGenerateMipmap(GLenum target);

/* OpenGL 2.x - 3.x (shaders and buffers) */
void glGenBuffers(GLsizei n, GLuint *buffers);
void glDeleteBuffers(GLsizei n, const GLuint *buffers);
void glBindBuffer(GLenum target, GLuint buffer);
void glBufferData(GLenum target, GLsizeiptr size, const void *data, GLenum usage);
void glBufferSubData(GLenum target, GLintptr offset, GLsizeiptr size, const void *data);
void glGenVertexArrays(GLsizei n, GLuint *arrays);
void glDeleteVertexArrays(GLsizei n, const GLuint *arrays);
void glBindVertexArray(GLuint array);
void glVertexAttribPointer(GLuint index, GLint size, GLenum type, GLboolean normalized, GLsizei stride, const void *pointer);
void glEnableVertexAttribArray(GLuint index);
void glDisableVertexAttribArray(GLuint index);
void glVertexAttrib3f(GLuint index, GLfloat x, GLfloat y, GLfloat z);
void glVertexAttrib4f(GLuint index, GLfloat x, GLfloat y, GLfloat z, GLfloat w);
void glDrawArrays(GLenum mode, GLint first, GLsizei count);
void glDrawElements(GLenum mode, GLsizei count, GLenum type, const void *indices);
void glDrawArraysInstanced(GLenum mode, GLint first, GLsizei count, GLsizei instancecount);
void glVertexAttribDivisor(GLuint index, GLuint divisor);
GLuint glCreateShader(GLenum type);
void glShaderSource(GLuint shader, GLsizei count, const GLchar *const *string, const GLint *length);
void glCompileShader(GLuint shader);
void glGetShaderiv(GLuint shader, GLenum pname, GLint *params);
void glGetShaderInfoLog(GLuint shader, GLsizei bufSize, GLsizei *length, GLchar *infoLog);
void glDeleteShader(GLuint shader);
GLuint glCreateProgram(void);
void glAttachShader(GLuint program, GLuint shader);
void glDetachShader(GLuint program, GLuint shader);
void glLinkProgram(GLuint program);
void glValidateProgram(GLuint program);
void glGetProgramiv(GLuint program, GLenum pname, GLint *params);
void glGetProgramInfoLog(GLuint program, GLsizei bufSize, GLsizei *length, GLchar *infoLog);
void glUseProgram(GLuint program);
void glDeleteProgram(GLuint program);
void glBindAttribLocation(GLuint program, GLuint index, const GLchar *name);
GLint glGetAttribLocation(GLuint program, const GLchar *name);
GLint glGetUniformLocation(GLuint program, const GLchar *name);
void glUniform1i(GLint location, GLint v0);
void glUniform2i(GLint location, GLint v0, GLint v1);
void glUniform1f(GLint location, GLfloat v0);
void glUniform2f(GLint location, GLfloat v0, GLfloat v1);
void glUniform3f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2);
void glUniform4f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2, GLfloat v3);
void glUniform1fv(GLint location, GLsizei count, const GLfloat *value);
void glUniform2fv(GLint location, GLsizei count, const GLfloat *value);
void glUniform3fv(GLint location, GLsizei count, const GLfloat *value);
void glUniform4fv(GLint location, GLsizei count, const GLfloat *value);
void glUniform1iv(GLint location, GLsizei count, const GLint *value);
void glUniformMatrix3fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat *value);
void glUniformMatrix4fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat *value);
void glGenFramebuffers(GLsizei n, GLuint *ids);
void glBindFramebuffer(GLenum target, GLuint framebuffer);
void glDeleteFramebuffers(GLsizei n, const GLuint *ids);
void glFramebufferTexture2D(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level);
GLenum glCheckFramebufferStatus(GLenum target);
void glGenRenderbuffers(GLsizei n, GLuint *ids);
void glBindRenderbuffer(GLenum target, GLuint renderbuffer);
void glRenderbufferStorage(GLenum target, GLenum internalformat, GLsizei width, GLsizei height);
void glFramebufferRenderbuffer(GLenum target, GLenum attachment, GLenum renderbuffertarget, GLuint renderbuffer);
#endif
`;

  const GLU_H = String.raw`/* GL/glu.h (Smoki's Code) */
#ifndef __glu_h__
#define __glu_h__
#include <GL/gl.h>
void gluPerspective(GLdouble fovy, GLdouble aspect, GLdouble zNear, GLdouble zFar);
void gluOrtho2D(GLdouble left, GLdouble right, GLdouble bottom, GLdouble top);
void gluLookAt(GLdouble eyeX, GLdouble eyeY, GLdouble eyeZ, GLdouble centerX, GLdouble centerY, GLdouble centerZ, GLdouble upX, GLdouble upY, GLdouble upZ);
const GLubyte *gluErrorString(GLenum error);
#endif
`;

  // glGetString needs strings in WebAssembly memory, so it is written in C.
  const GL_C = String.raw`/* gl.c (Smoki's Code) */
#include <GL/gl.h>
#include <GL/glu.h>
const GLubyte *glGetString(GLenum name) {
  switch (name) {
    case GL_VENDOR: return (const GLubyte *)"Smoki's Code";
    case GL_RENDERER: return (const GLubyte *)"WebGL 2 (browser)";
    case GL_VERSION: return (const GLubyte *)"3.3 (WebGL 2 in Smoki's Code)";
    case GL_SHADING_LANGUAGE_VERSION: return (const GLubyte *)"3.30";
    default: return (const GLubyte *)"";
  }
}
const GLubyte *gluErrorString(GLenum error) { return (const GLubyte *)(error ? "OpenGL error" : "no error"); }
`;

  /* ---------------------------------------------------------------- freeglut */
  const GLUT_H = String.raw`/* GL/glut.h and GL/freeglut.h (Smoki's Code) */
#ifndef __FREEGLUT_H__
#define __FREEGLUT_H__
#include <stdlib.h>
#include <GL/gl.h>
#include <GL/glu.h>
#define FREEGLUT 1
#define GLUT_API_VERSION 4
#define GLUT_RGB 0
#define GLUT_RGBA 0
#define GLUT_INDEX 1
#define GLUT_SINGLE 0
#define GLUT_DOUBLE 2
#define GLUT_ACCUM 4
#define GLUT_ALPHA 8
#define GLUT_DEPTH 16
#define GLUT_STENCIL 32
#define GLUT_MULTISAMPLE 128
#define GLUT_LEFT_BUTTON 0
#define GLUT_MIDDLE_BUTTON 1
#define GLUT_RIGHT_BUTTON 2
#define GLUT_DOWN 0
#define GLUT_UP 1
#define GLUT_KEY_F1 1
#define GLUT_KEY_F2 2
#define GLUT_KEY_F3 3
#define GLUT_KEY_F4 4
#define GLUT_KEY_F5 5
#define GLUT_KEY_F6 6
#define GLUT_KEY_F7 7
#define GLUT_KEY_F8 8
#define GLUT_KEY_F9 9
#define GLUT_KEY_F10 10
#define GLUT_KEY_F11 11
#define GLUT_KEY_F12 12
#define GLUT_KEY_LEFT 100
#define GLUT_KEY_UP 101
#define GLUT_KEY_RIGHT 102
#define GLUT_KEY_DOWN 103
#define GLUT_KEY_PAGE_UP 104
#define GLUT_KEY_PAGE_DOWN 105
#define GLUT_KEY_HOME 106
#define GLUT_KEY_END 107
#define GLUT_KEY_INSERT 108
#define GLUT_ACTIVE_SHIFT 1
#define GLUT_ACTIVE_CTRL 2
#define GLUT_ACTIVE_ALT 4
#define GLUT_ELAPSED_TIME 700
#define GLUT_WINDOW_WIDTH 102
#define GLUT_WINDOW_HEIGHT 103
#define GLUT_SCREEN_WIDTH 200
#define GLUT_SCREEN_HEIGHT 201
#define GLUT_ACTION_ON_WINDOW_CLOSE 0x01F9
#define GLUT_ACTION_EXIT 0
#define GLUT_ACTION_GLUTMAINLOOP_RETURNS 1
#define GLUT_ACTION_CONTINUE_EXECUTION 2
void glutInit(int *argc, char **argv);
void glutInitDisplayMode(unsigned int mode);
void glutInitWindowSize(int width, int height);
void glutInitWindowPosition(int x, int y);
void glutInitContextVersion(int major, int minor);
void glutInitContextProfile(int profile);
int glutCreateWindow(const char *title);
void glutDestroyWindow(int win);
void glutSetWindowTitle(const char *title);
void glutReshapeWindow(int width, int height);
void glutPositionWindow(int x, int y);
void glutFullScreen(void);
void glutDisplayFunc(void (*func)(void));
void glutReshapeFunc(void (*func)(int width, int height));
void glutIdleFunc(void (*func)(void));
void glutKeyboardFunc(void (*func)(unsigned char key, int x, int y));
void glutKeyboardUpFunc(void (*func)(unsigned char key, int x, int y));
void glutSpecialFunc(void (*func)(int key, int x, int y));
void glutSpecialUpFunc(void (*func)(int key, int x, int y));
void glutMouseFunc(void (*func)(int button, int state, int x, int y));
void glutMotionFunc(void (*func)(int x, int y));
void glutPassiveMotionFunc(void (*func)(int x, int y));
void glutTimerFunc(unsigned int millis, void (*func)(int value), int value);
void glutCloseFunc(void (*func)(void));
void glutPostRedisplay(void);
void glutSwapBuffers(void);
void glutMainLoop(void);
void glutMainLoopEvent(void);
void glutLeaveMainLoop(void);
void glutSetOption(GLenum what, int value);
int glutGet(GLenum state);
int glutGetModifiers(void);
void glutSetCursor(int cursor);
void glutBitmapCharacter(void *font, int character);
void glutStrokeCharacter(void *font, int character);
int glutBitmapWidth(void *font, int character);
void glutSolidCube(double size);
void glutWireCube(double size);
void glutSolidSphere(double radius, int slices, int stacks);
void glutWireSphere(double radius, int slices, int stacks);
void glutSolidCone(double base, double height, int slices, int stacks);
void glutWireCone(double base, double height, int slices, int stacks);
void glutSolidTorus(double inner, double outer, int sides, int rings);
void glutWireTorus(double inner, double outer, int sides, int rings);
void glutSolidTeapot(double size);
void glutWireTeapot(double size);
#define GLUT_BITMAP_8_BY_13 ((void *)3)
#define GLUT_BITMAP_9_BY_15 ((void *)2)
#define GLUT_BITMAP_TIMES_ROMAN_10 ((void *)4)
#define GLUT_BITMAP_TIMES_ROMAN_24 ((void *)5)
#define GLUT_BITMAP_HELVETICA_10 ((void *)6)
#define GLUT_BITMAP_HELVETICA_12 ((void *)7)
#define GLUT_BITMAP_HELVETICA_18 ((void *)8)
#define GLUT_STROKE_ROMAN ((void *)0)
#endif
`;

  const GLUT_C = String.raw`/* glut.c (Smoki's Code): freeglut's main loop in the browser */
#include <GL/glut.h>
#include "smoki_gfx.h"
#include <stdlib.h>
#include <math.h>

void gl_bitmap_text(const char *text, int size);
static int winW = 300, winH = 300, created = 0, redisplay = 1, leave = 0, mods = 0, closeAction = 0;
static void (*displayCb)(void), (*reshapeCb)(int, int), (*idleCb)(void), (*closeCb)(void);
static void (*keyCb)(unsigned char, int, int), (*keyUpCb)(unsigned char, int, int);
static void (*specialCb)(int, int, int), (*specialUpCb)(int, int, int);
static void (*mouseCb)(int, int, int, int), (*motionCb)(int, int), (*passiveCb)(int, int);
#define MAX_TIMERS 64
static struct { double due; void (*cb)(int); int value; int used; } timers[MAX_TIMERS];
static int wteapot;

void glutInit(int *argc, char **argv) {}
void glutInitDisplayMode(unsigned int mode) {}
void glutInitWindowSize(int w, int h) { winW = w; winH = h; }
void glutInitWindowPosition(int x, int y) {}
void glutInitContextVersion(int major, int minor) {}
void glutInitContextProfile(int profile) {}
int glutCreateWindow(const char *title) { sg_window(winW, winH, title); created = 1; return 1; }
void glutDestroyWindow(int win) { sg_close(); }
void glutSetWindowTitle(const char *title) { sg_title(title); }
void glutReshapeWindow(int w, int h) { winW = w; winH = h; sg_window(w, h, 0); if (reshapeCb) reshapeCb(w, h); }
void glutPositionWindow(int x, int y) {}
void glutFullScreen(void) {}
void glutDisplayFunc(void (*f)(void)) { displayCb = f; }
void glutReshapeFunc(void (*f)(int, int)) { reshapeCb = f; }
void glutIdleFunc(void (*f)(void)) { idleCb = f; }
void glutKeyboardFunc(void (*f)(unsigned char, int, int)) { keyCb = f; }
void glutKeyboardUpFunc(void (*f)(unsigned char, int, int)) { keyUpCb = f; }
void glutSpecialFunc(void (*f)(int, int, int)) { specialCb = f; }
void glutSpecialUpFunc(void (*f)(int, int, int)) { specialUpCb = f; }
void glutMouseFunc(void (*f)(int, int, int, int)) { mouseCb = f; }
void glutMotionFunc(void (*f)(int, int)) { motionCb = f; }
void glutPassiveMotionFunc(void (*f)(int, int)) { passiveCb = f; }
void glutCloseFunc(void (*f)(void)) { closeCb = f; }
void glutTimerFunc(unsigned int ms, void (*f)(int), int value) {
  for (int i = 0; i < MAX_TIMERS; i++) if (!timers[i].used) { timers[i].used = 1; timers[i].due = sg_time() + ms / 1000.0; timers[i].cb = f; timers[i].value = value; return; }
}
void glutPostRedisplay(void) { redisplay = 1; }
void glutSwapBuffers(void) {}
void glutLeaveMainLoop(void) { leave = 1; }
void glutSetOption(GLenum what, int value) { if (what == GLUT_ACTION_ON_WINDOW_CLOSE) closeAction = value; }
int glutGet(GLenum state) {
  switch (state) {
    case GLUT_ELAPSED_TIME: return (int)(sg_time() * 1000.0);
    case GLUT_WINDOW_WIDTH: return winW;
    case GLUT_WINDOW_HEIGHT: return winH;
    case GLUT_SCREEN_WIDTH: return 1920;
    case GLUT_SCREEN_HEIGHT: return 1080;
    default: return 0;
  }
}
int glutGetModifiers(void) { return mods; }
void glutSetCursor(int cursor) {}

static int specialKey(int k) {
  if (k >= 290 && k <= 301) return k - 289;
  switch (k) {
    case 263: return GLUT_KEY_LEFT; case 265: return GLUT_KEY_UP; case 262: return GLUT_KEY_RIGHT; case 264: return GLUT_KEY_DOWN;
    case 266: return GLUT_KEY_PAGE_UP; case 267: return GLUT_KEY_PAGE_DOWN; case 268: return GLUT_KEY_HOME; case 269: return GLUT_KEY_END; case 260: return GLUT_KEY_INSERT;
    default: return -1;
  }
}
static int asciiKey(int k, int ch) {
  if (ch > 0 && ch < 256) return ch;
  switch (k) { case 256: return 27; case 257: return 13; case 258: return 9; case 259: return 8; case 261: return 127; default: return -1; }
}

void glutMainLoopEvent(void) {
  sg_event e;
  int pendingKey = 0;
  while (sg_poll(&e)) {
    mods = ((e.mods & 1) ? GLUT_ACTIVE_SHIFT : 0) | ((e.mods & 2) ? GLUT_ACTIVE_CTRL : 0) | ((e.mods & 4) ? GLUT_ACTIVE_ALT : 0);
    if (e.type == SG_KEYDOWN || e.type == SG_KEYUP) {
      int s = specialKey(e.key);
      int a = asciiKey(e.key, e.ch);
      if (s >= 0) {
        if (e.type == SG_KEYDOWN && specialCb) specialCb(s, e.x, e.y);
        if (e.type == SG_KEYUP && specialUpCb) specialUpCb(s, e.x, e.y);
      } else if (a >= 0) {
        if (e.type == SG_KEYDOWN && keyCb) keyCb((unsigned char)a, e.x, e.y);
        if (e.type == SG_KEYUP && keyUpCb) keyUpCb((unsigned char)a, e.x, e.y);
      }
    } else if (e.type == SG_MOUSEDOWN || e.type == SG_MOUSEUP) {
      int b = e.button == 1 ? GLUT_RIGHT_BUTTON : e.button == 2 ? GLUT_MIDDLE_BUTTON : GLUT_LEFT_BUTTON;
      if (mouseCb) mouseCb(b, e.type == SG_MOUSEDOWN ? GLUT_DOWN : GLUT_UP, e.x, e.y);
    } else if (e.type == SG_MOUSEMOVE) {
      if (e.button && motionCb) motionCb(e.x, e.y);
      else if (!e.button && passiveCb) passiveCb(e.x, e.y);
    } else if (e.type == SG_WHEEL) {
      if (mouseCb) mouseCb(e.wheel > 0 ? 3 : 4, GLUT_DOWN, e.x, e.y);
    } else if (e.type == SG_CLOSE) {
      if (closeCb) closeCb();
      if (closeAction == GLUT_ACTION_EXIT) exit(0);
      leave = 1;
    }
  }
  double now = sg_time();
  for (int i = 0; i < MAX_TIMERS; i++) {
    if (timers[i].used && timers[i].due <= now) { void (*cb)(int) = timers[i].cb; int v = timers[i].value; timers[i].used = 0; cb(v); }
  }
}

void glutMainLoop(void) {
  if (!created) glutCreateWindow("freeglut");
  if (reshapeCb) reshapeCb(winW, winH); else glViewport(0, 0, winW, winH);
  while (!leave) {
    glutMainLoopEvent();
    if (leave) break;
    if (idleCb) idleCb();
    if (redisplay && displayCb) { redisplay = 0; displayCb(); }
    sg_frame();
  }
}

void glutBitmapCharacter(void *font, int c) { char s[2] = { (char)c, 0 }; gl_bitmap_text(s, font == GLUT_BITMAP_TIMES_ROMAN_24 ? 24 : font == GLUT_BITMAP_HELVETICA_18 ? 18 : font == GLUT_BITMAP_9_BY_15 ? 15 : 13); }
void glutStrokeCharacter(void *font, int c) { glutBitmapCharacter(GLUT_BITMAP_HELVETICA_18, c); }
int glutBitmapWidth(void *font, int c) { return 8; }

static void cubeFaces(double s, GLenum mode) {
  float h = (float)s / 2;
  static const float n[6][3] = { {0,0,1},{0,0,-1},{0,1,0},{0,-1,0},{1,0,0},{-1,0,0} };
  static const int f[6][4][3] = {
    {{-1,-1,1},{1,-1,1},{1,1,1},{-1,1,1}}, {{-1,-1,-1},{-1,1,-1},{1,1,-1},{1,-1,-1}},
    {{-1,1,-1},{-1,1,1},{1,1,1},{1,1,-1}}, {{-1,-1,-1},{1,-1,-1},{1,-1,1},{-1,-1,1}},
    {{1,-1,-1},{1,1,-1},{1,1,1},{1,-1,1}}, {{-1,-1,-1},{-1,-1,1},{-1,1,1},{-1,1,-1}} };
  for (int i = 0; i < 6; i++) {
    glBegin(mode);
    glNormal3f(n[i][0], n[i][1], n[i][2]);
    for (int j = 0; j < 4; j++) glVertex3f(f[i][j][0] * h, f[i][j][1] * h, f[i][j][2] * h);
    glEnd();
  }
}
void glutSolidCube(double size) { cubeFaces(size, GL_QUADS); }
void glutWireCube(double size) { cubeFaces(size, GL_LINE_LOOP); }
static void sphere(double r, int slices, int stacks, int wire) {
  for (int i = 0; i < stacks; i++) {
    double a0 = M_PI * (-0.5 + (double)i / stacks), a1 = M_PI * (-0.5 + (double)(i + 1) / stacks);
    glBegin(wire ? GL_LINE_STRIP : GL_QUAD_STRIP);
    for (int j = 0; j <= slices; j++) {
      double lng = 2 * M_PI * j / slices, x = cos(lng), y = sin(lng);
      glNormal3d(x * cos(a0), y * cos(a0), sin(a0)); glVertex3d(r * x * cos(a0), r * y * cos(a0), r * sin(a0));
      glNormal3d(x * cos(a1), y * cos(a1), sin(a1)); glVertex3d(r * x * cos(a1), r * y * cos(a1), r * sin(a1));
    }
    glEnd();
  }
}
void glutSolidSphere(double r, int slices, int stacks) { sphere(r, slices, stacks, 0); }
void glutWireSphere(double r, int slices, int stacks) { sphere(r, slices, stacks, 1); }
static void cone(double base, double height, int slices, int wire) {
  glBegin(wire ? GL_LINE_LOOP : GL_TRIANGLE_FAN);
  glVertex3d(0, 0, height);
  for (int j = 0; j <= slices; j++) { double a = 2 * M_PI * j / slices; glVertex3d(base * cos(a), base * sin(a), 0); }
  glEnd();
  glBegin(wire ? GL_LINE_LOOP : GL_TRIANGLE_FAN);
  glVertex3d(0, 0, 0);
  for (int j = slices; j >= 0; j--) { double a = 2 * M_PI * j / slices; glVertex3d(base * cos(a), base * sin(a), 0); }
  glEnd();
}
void glutSolidCone(double base, double height, int slices, int stacks) { cone(base, height, slices, 0); }
void glutWireCone(double base, double height, int slices, int stacks) { cone(base, height, slices, 1); }
static void torus(double r, double R, int sides, int rings, int wire) {
  for (int i = 0; i < rings; i++) {
    glBegin(wire ? GL_LINE_STRIP : GL_QUAD_STRIP);
    for (int j = 0; j <= sides; j++) {
      for (int k = 1; k >= 0; k--) {
        double s = (i + k) % rings + 0.5, t = j % sides;
        double x = (R + r * cos(s * 2 * M_PI / rings)) * cos(t * 2 * M_PI / sides);
        double y = (R + r * cos(s * 2 * M_PI / rings)) * sin(t * 2 * M_PI / sides);
        double z = r * sin(s * 2 * M_PI / rings);
        glNormal3d(cos(s * 2 * M_PI / rings) * cos(t * 2 * M_PI / sides), cos(s * 2 * M_PI / rings) * sin(t * 2 * M_PI / sides), sin(s * 2 * M_PI / rings));
        glVertex3d(x, y, z);
      }
    }
    glEnd();
  }
}
void glutSolidTorus(double inner, double outer, int sides, int rings) { torus(inner, outer, rings, sides, 0); }
void glutWireTorus(double inner, double outer, int sides, int rings) { torus(inner, outer, rings, sides, 1); }
void glutSolidTeapot(double size) { if (!wteapot) { wteapot = 1; sg_warn("glutSolidTeapot draws a sphere in the browser version."); } sphere(size, 24, 16, 0); }
void glutWireTeapot(double size) { if (!wteapot) { wteapot = 1; sg_warn("glutWireTeapot draws a sphere in the browser version."); } sphere(size, 24, 16, 1); }
`;

  /* ---------------------------------------------------------------- GLFW */
  const GLFW_H = String.raw`/* GLFW/glfw3.h (Smoki's Code: the GLFW 3.4 API on a browser window) */
#ifndef _glfw3_h_
#define _glfw3_h_
#ifndef GLFW_INCLUDE_NONE
#include <GL/gl.h>
#endif
#define GLFW_VERSION_MAJOR 3
#define GLFW_VERSION_MINOR 4
#define GLFW_TRUE 1
#define GLFW_FALSE 0
#define GLFW_RELEASE 0
#define GLFW_PRESS 1
#define GLFW_REPEAT 2
#define GLFW_KEY_UNKNOWN -1
#define GLFW_KEY_SPACE 32
#define GLFW_KEY_APOSTROPHE 39
#define GLFW_KEY_COMMA 44
#define GLFW_KEY_MINUS 45
#define GLFW_KEY_PERIOD 46
#define GLFW_KEY_SLASH 47
#define GLFW_KEY_0 48
#define GLFW_KEY_1 49
#define GLFW_KEY_2 50
#define GLFW_KEY_3 51
#define GLFW_KEY_4 52
#define GLFW_KEY_5 53
#define GLFW_KEY_6 54
#define GLFW_KEY_7 55
#define GLFW_KEY_8 56
#define GLFW_KEY_9 57
#define GLFW_KEY_SEMICOLON 59
#define GLFW_KEY_EQUAL 61
#define GLFW_KEY_A 65
#define GLFW_KEY_B 66
#define GLFW_KEY_C 67
#define GLFW_KEY_D 68
#define GLFW_KEY_E 69
#define GLFW_KEY_F 70
#define GLFW_KEY_G 71
#define GLFW_KEY_H 72
#define GLFW_KEY_I 73
#define GLFW_KEY_J 74
#define GLFW_KEY_K 75
#define GLFW_KEY_L 76
#define GLFW_KEY_M 77
#define GLFW_KEY_N 78
#define GLFW_KEY_O 79
#define GLFW_KEY_P 80
#define GLFW_KEY_Q 81
#define GLFW_KEY_R 82
#define GLFW_KEY_S 83
#define GLFW_KEY_T 84
#define GLFW_KEY_U 85
#define GLFW_KEY_V 86
#define GLFW_KEY_W 87
#define GLFW_KEY_X 88
#define GLFW_KEY_Y 89
#define GLFW_KEY_Z 90
#define GLFW_KEY_ESCAPE 256
#define GLFW_KEY_ENTER 257
#define GLFW_KEY_TAB 258
#define GLFW_KEY_BACKSPACE 259
#define GLFW_KEY_INSERT 260
#define GLFW_KEY_DELETE 261
#define GLFW_KEY_RIGHT 262
#define GLFW_KEY_LEFT 263
#define GLFW_KEY_DOWN 264
#define GLFW_KEY_UP 265
#define GLFW_KEY_PAGE_UP 266
#define GLFW_KEY_PAGE_DOWN 267
#define GLFW_KEY_HOME 268
#define GLFW_KEY_END 269
#define GLFW_KEY_F1 290
#define GLFW_KEY_F2 291
#define GLFW_KEY_F3 292
#define GLFW_KEY_F4 293
#define GLFW_KEY_F5 294
#define GLFW_KEY_LEFT_SHIFT 340
#define GLFW_KEY_LEFT_CONTROL 341
#define GLFW_KEY_LEFT_ALT 342
#define GLFW_KEY_RIGHT_SHIFT 344
#define GLFW_KEY_RIGHT_CONTROL 345
#define GLFW_KEY_RIGHT_ALT 346
#define GLFW_KEY_LAST 348
#define GLFW_MOD_SHIFT 1
#define GLFW_MOD_CONTROL 2
#define GLFW_MOD_ALT 4
#define GLFW_MOUSE_BUTTON_1 0
#define GLFW_MOUSE_BUTTON_2 1
#define GLFW_MOUSE_BUTTON_3 2
#define GLFW_MOUSE_BUTTON_LEFT 0
#define GLFW_MOUSE_BUTTON_RIGHT 1
#define GLFW_MOUSE_BUTTON_MIDDLE 2
#define GLFW_CONTEXT_VERSION_MAJOR 0x00022002
#define GLFW_CONTEXT_VERSION_MINOR 0x00022003
#define GLFW_OPENGL_PROFILE 0x00022008
#define GLFW_OPENGL_CORE_PROFILE 0x00032001
#define GLFW_OPENGL_COMPAT_PROFILE 0x00032002
#define GLFW_OPENGL_FORWARD_COMPAT 0x00022006
#define GLFW_RESIZABLE 0x00020003
#define GLFW_VISIBLE 0x00020004
#define GLFW_SAMPLES 0x0002100D
#define GLFW_DOUBLEBUFFER 0x00021010
#define GLFW_CURSOR 0x00033001
#define GLFW_CURSOR_NORMAL 0x00034001
#define GLFW_CURSOR_HIDDEN 0x00034002
#define GLFW_CURSOR_DISABLED 0x00034003
typedef struct GLFWwindow GLFWwindow;
typedef struct GLFWmonitor GLFWmonitor;
typedef void (*GLFWglproc)(void);
typedef void (*GLFWerrorfun)(int error_code, const char *description);
typedef void (*GLFWkeyfun)(GLFWwindow *window, int key, int scancode, int action, int mods);
typedef void (*GLFWcharfun)(GLFWwindow *window, unsigned int codepoint);
typedef void (*GLFWmousebuttonfun)(GLFWwindow *window, int button, int action, int mods);
typedef void (*GLFWcursorposfun)(GLFWwindow *window, double xpos, double ypos);
typedef void (*GLFWscrollfun)(GLFWwindow *window, double xoffset, double yoffset);
typedef void (*GLFWframebuffersizefun)(GLFWwindow *window, int width, int height);
typedef void (*GLFWwindowsizefun)(GLFWwindow *window, int width, int height);
typedef void (*GLFWwindowclosefun)(GLFWwindow *window);
int glfwInit(void);
void glfwTerminate(void);
void glfwWindowHint(int hint, int value);
void glfwDefaultWindowHints(void);
GLFWwindow *glfwCreateWindow(int width, int height, const char *title, GLFWmonitor *monitor, GLFWwindow *share);
void glfwDestroyWindow(GLFWwindow *window);
int glfwWindowShouldClose(GLFWwindow *window);
void glfwSetWindowShouldClose(GLFWwindow *window, int value);
void glfwSetWindowTitle(GLFWwindow *window, const char *title);
void glfwGetWindowSize(GLFWwindow *window, int *width, int *height);
void glfwSetWindowSize(GLFWwindow *window, int width, int height);
void glfwGetFramebufferSize(GLFWwindow *window, int *width, int *height);
void glfwMakeContextCurrent(GLFWwindow *window);
GLFWwindow *glfwGetCurrentContext(void);
void glfwSwapBuffers(GLFWwindow *window);
void glfwSwapInterval(int interval);
void glfwPollEvents(void);
void glfwWaitEvents(void);
void glfwWaitEventsTimeout(double timeout);
double glfwGetTime(void);
void glfwSetTime(double time);
int glfwGetKey(GLFWwindow *window, int key);
int glfwGetMouseButton(GLFWwindow *window, int button);
void glfwGetCursorPos(GLFWwindow *window, double *xpos, double *ypos);
void glfwSetInputMode(GLFWwindow *window, int mode, int value);
GLFWerrorfun glfwSetErrorCallback(GLFWerrorfun callback);
GLFWkeyfun glfwSetKeyCallback(GLFWwindow *window, GLFWkeyfun callback);
GLFWcharfun glfwSetCharCallback(GLFWwindow *window, GLFWcharfun callback);
GLFWmousebuttonfun glfwSetMouseButtonCallback(GLFWwindow *window, GLFWmousebuttonfun callback);
GLFWcursorposfun glfwSetCursorPosCallback(GLFWwindow *window, GLFWcursorposfun callback);
GLFWscrollfun glfwSetScrollCallback(GLFWwindow *window, GLFWscrollfun callback);
GLFWframebuffersizefun glfwSetFramebufferSizeCallback(GLFWwindow *window, GLFWframebuffersizefun callback);
GLFWwindowsizefun glfwSetWindowSizeCallback(GLFWwindow *window, GLFWwindowsizefun callback);
GLFWwindowclosefun glfwSetWindowCloseCallback(GLFWwindow *window, GLFWwindowclosefun callback);
void glfwSetWindowUserPointer(GLFWwindow *window, void *pointer);
void *glfwGetWindowUserPointer(GLFWwindow *window);
GLFWglproc glfwGetProcAddress(const char *procname);
GLFWmonitor *glfwGetPrimaryMonitor(void);
const char *glfwGetVersionString(void);
#endif
`;

  const GLFW_C = String.raw`/* glfw.c (Smoki's Code): GLFW on a browser window */
#include <GLFW/glfw3.h>
#include "smoki_gfx.h"
#include <stdlib.h>
#include <string.h>
struct GLFWwindow { int w, h, shouldClose; void *user; };
static struct GLFWwindow theWindow;
static int hintW, created;
static GLFWkeyfun keyCb; static GLFWcharfun charCb; static GLFWmousebuttonfun buttonCb; static GLFWcursorposfun posCb;
static GLFWscrollfun scrollCb; static GLFWframebuffersizefun fbCb; static GLFWwindowsizefun sizeCb; static GLFWwindowclosefun closeCb;
static double timeOffset;
int glfwInit(void) { return GLFW_TRUE; }
void glfwTerminate(void) { if (created) sg_close(); created = 0; }
void glfwWindowHint(int hint, int value) {}
void glfwDefaultWindowHints(void) {}
GLFWwindow *glfwCreateWindow(int w, int h, const char *title, GLFWmonitor *m, GLFWwindow *share) {
  theWindow.w = w; theWindow.h = h; theWindow.shouldClose = 0; created = 1;
  sg_window(w, h, title); return &theWindow;
}
void glfwDestroyWindow(GLFWwindow *win) { sg_close(); created = 0; }
int glfwWindowShouldClose(GLFWwindow *win) { return win->shouldClose; }
void glfwSetWindowShouldClose(GLFWwindow *win, int value) { win->shouldClose = value; }
void glfwSetWindowTitle(GLFWwindow *win, const char *title) { sg_title(title); }
void glfwGetWindowSize(GLFWwindow *win, int *w, int *h) { if (w) *w = win->w; if (h) *h = win->h; }
void glfwSetWindowSize(GLFWwindow *win, int w, int h) { win->w = w; win->h = h; sg_window(w, h, 0); if (fbCb) fbCb(win, w, h); if (sizeCb) sizeCb(win, w, h); }
void glfwGetFramebufferSize(GLFWwindow *win, int *w, int *h) { glfwGetWindowSize(win, w, h); }
void glfwMakeContextCurrent(GLFWwindow *win) {}
GLFWwindow *glfwGetCurrentContext(void) { return created ? &theWindow : 0; }
void glfwSwapBuffers(GLFWwindow *win) { sg_frame(); }
void glfwSwapInterval(int interval) {}
static int mods;
void glfwPollEvents(void) {
  sg_event e;
  while (sg_poll(&e)) {
    mods = e.mods;
    if (e.type == SG_KEYDOWN || e.type == SG_KEYUP) { if (keyCb) keyCb(&theWindow, e.key, e.key, e.type == SG_KEYDOWN ? GLFW_PRESS : GLFW_RELEASE, e.mods); }
    else if (e.type == SG_CHAR) { if (charCb) charCb(&theWindow, (unsigned int)e.ch); }
    else if (e.type == SG_MOUSEDOWN || e.type == SG_MOUSEUP) { if (buttonCb) buttonCb(&theWindow, e.button, e.type == SG_MOUSEDOWN ? GLFW_PRESS : GLFW_RELEASE, e.mods); }
    else if (e.type == SG_MOUSEMOVE) { if (posCb) posCb(&theWindow, e.x, e.y); }
    else if (e.type == SG_WHEEL) { if (scrollCb) scrollCb(&theWindow, 0, e.wheel); }
    else if (e.type == SG_CLOSE) { theWindow.shouldClose = 1; if (closeCb) closeCb(&theWindow); }
  }
}
void glfwWaitEvents(void) { glfwPollEvents(); }
void glfwWaitEventsTimeout(double timeout) { glfwPollEvents(); }
double glfwGetTime(void) { return sg_time() - timeOffset; }
void glfwSetTime(double t) { timeOffset = sg_time() - t; }
int glfwGetKey(GLFWwindow *win, int key) { return (sg_key(key) & 1) ? GLFW_PRESS : GLFW_RELEASE; }
int glfwGetMouseButton(GLFWwindow *win, int button) { return (sg_mouse_button(button) & 1) ? GLFW_PRESS : GLFW_RELEASE; }
void glfwGetCursorPos(GLFWwindow *win, double *x, double *y) { if (x) *x = sg_mouse_x(); if (y) *y = sg_mouse_y(); }
void glfwSetInputMode(GLFWwindow *win, int mode, int value) {}
GLFWerrorfun glfwSetErrorCallback(GLFWerrorfun cb) { return 0; }
GLFWkeyfun glfwSetKeyCallback(GLFWwindow *w, GLFWkeyfun cb) { GLFWkeyfun old = keyCb; keyCb = cb; return old; }
GLFWcharfun glfwSetCharCallback(GLFWwindow *w, GLFWcharfun cb) { GLFWcharfun old = charCb; charCb = cb; return old; }
GLFWmousebuttonfun glfwSetMouseButtonCallback(GLFWwindow *w, GLFWmousebuttonfun cb) { GLFWmousebuttonfun old = buttonCb; buttonCb = cb; return old; }
GLFWcursorposfun glfwSetCursorPosCallback(GLFWwindow *w, GLFWcursorposfun cb) { GLFWcursorposfun old = posCb; posCb = cb; return old; }
GLFWscrollfun glfwSetScrollCallback(GLFWwindow *w, GLFWscrollfun cb) { GLFWscrollfun old = scrollCb; scrollCb = cb; return old; }
GLFWframebuffersizefun glfwSetFramebufferSizeCallback(GLFWwindow *w, GLFWframebuffersizefun cb) { GLFWframebuffersizefun old = fbCb; fbCb = cb; return old; }
GLFWwindowsizefun glfwSetWindowSizeCallback(GLFWwindow *w, GLFWwindowsizefun cb) { GLFWwindowsizefun old = sizeCb; sizeCb = cb; return old; }
GLFWwindowclosefun glfwSetWindowCloseCallback(GLFWwindow *w, GLFWwindowclosefun cb) { GLFWwindowclosefun old = closeCb; closeCb = cb; return old; }
void glfwSetWindowUserPointer(GLFWwindow *w, void *p) { w->user = p; }
void *glfwGetWindowUserPointer(GLFWwindow *w) { return w->user; }
GLFWglproc glfwGetProcAddress(const char *name) { return (GLFWglproc)1; }
GLFWmonitor *glfwGetPrimaryMonitor(void) { return 0; }
const char *glfwGetVersionString(void) { return "3.4.0 Smoki's Code (browser)"; }
`;

  /* ---------------------------------------------------------------- GLEW, glad */
  const GLEW_H = String.raw`/* GL/glew.h (Smoki's Code): every OpenGL function is already loaded */
#ifndef __glew_h__
#define __glew_h__
#include <GL/gl.h>
#define GLEW_OK 0
#define GLEW_NO_ERROR 0
#define GLEW_VERSION 1
#define GLEW_VERSION_3_3 1
extern GLboolean glewExperimental;
GLenum glewInit(void);
const GLubyte *glewGetErrorString(GLenum error);
const GLubyte *glewGetString(GLenum name);
#endif
`;
  const GLEW_C = String.raw`#include <GL/glew.h>
GLboolean glewExperimental = GL_TRUE;
GLenum glewInit(void) { return GLEW_OK; }
const GLubyte *glewGetErrorString(GLenum error) { return (const GLubyte *)"No error"; }
const GLubyte *glewGetString(GLenum name) { return (const GLubyte *)"2.2.0"; }
`;
  const GLAD_H = String.raw`/* glad/glad.h (Smoki's Code): every OpenGL function is already loaded */
#ifndef __glad_h_
#define __glad_h_
#include <GL/gl.h>
typedef void *(*GLADloadproc)(const char *name);
static inline int gladLoadGLLoader(GLADloadproc load) { return 1; }
static inline int gladLoadGL(void) { return 1; }
#endif
`;

  /** Files every graphics build gets. */
  const BASE = { '/usr/include/smoki_gfx.h': SG_H };

  /**
   * MSYS2 packages that pacman can install. `files` are written into the
   * compiler's file system; `sources` are compiled with your program.
   */
  const PACKAGES = {
    raylib: {
      names: ['mingw-w64-ucrt-x86_64-raylib', 'mingw-w64-x86_64-raylib', 'mingw-w64-clang-x86_64-raylib', 'raylib'],
      version: '5.5-1', size: 4.1, desc: 'A simple and easy-to-use library to enjoy videogames programming (mingw-w64)', deps: ['glfw'],
      headers: ['raylib.h', 'raymath.h'], libs: ['raylib'],
      files: { '/usr/include/raylib.h': RAYLIB_H, '/usr/include/raymath.h': RAYMATH_H, '/usr/lib/smoki/raylib.c': RAYLIB_C },
      sources: ['/usr/lib/smoki/raylib.c'],
    },
    freeglut: {
      names: ['mingw-w64-ucrt-x86_64-freeglut', 'mingw-w64-x86_64-freeglut', 'mingw-w64-clang-x86_64-freeglut', 'freeglut'],
      version: '3.6.0-1', size: 0.9, desc: 'Freeglut allows the user to create and manage windows containing OpenGL contexts (mingw-w64)', deps: ['opengl'],
      headers: ['GL/glut.h', 'GL/freeglut.h', 'GL/freeglut_std.h'], libs: ['freeglut', 'glut', 'glut32', 'freeglut_static'],
      files: { '/usr/include/GL/glut.h': GLUT_H, '/usr/include/GL/freeglut.h': '#include <GL/glut.h>\n', '/usr/include/GL/freeglut_std.h': '#include <GL/glut.h>\n', '/usr/lib/smoki/glut.c': GLUT_C },
      sources: ['/usr/lib/smoki/glut.c'],
    },
    glfw: {
      names: ['mingw-w64-ucrt-x86_64-glfw', 'mingw-w64-x86_64-glfw', 'mingw-w64-clang-x86_64-glfw', 'glfw'],
      version: '3.4-1', size: 0.6, desc: 'A free, open source, portable framework for OpenGL application development (mingw-w64)', deps: ['opengl'],
      headers: ['GLFW/glfw3.h'], libs: ['glfw3', 'glfw'],
      files: { '/usr/include/GLFW/glfw3.h': GLFW_H, '/usr/lib/smoki/glfw.c': GLFW_C },
      sources: ['/usr/lib/smoki/glfw.c'],
    },
    glew: {
      names: ['mingw-w64-ucrt-x86_64-glew', 'mingw-w64-x86_64-glew', 'mingw-w64-clang-x86_64-glew', 'glew'],
      version: '2.2.0-3', size: 1.5, desc: 'GLEW, The OpenGL Extension Wrangler Library (mingw-w64)', deps: ['opengl'],
      headers: ['GL/glew.h'], libs: ['glew32', 'GLEW'],
      files: { '/usr/include/GL/glew.h': GLEW_H, '/usr/lib/smoki/glew.c': GLEW_C },
      sources: ['/usr/lib/smoki/glew.c'],
    },
    glad: {
      names: ['mingw-w64-ucrt-x86_64-glad', 'mingw-w64-x86_64-glad', 'glad'],
      version: '2.0.8-1', size: 0.2, desc: 'Multi-language GL loader generator (headers for OpenGL 3.3 core)', deps: ['opengl'],
      headers: ['glad/glad.h'], libs: [],
      files: { '/usr/include/glad/glad.h': GLAD_H },
      sources: [],
    },
    opengl: {
      names: ['mingw-w64-ucrt-x86_64-mesa', 'mingw-w64-x86_64-mesa', 'mingw-w64-ucrt-x86_64-opengl', 'opengl', 'mesa', 'mingw-w64-ucrt-x86_64-glu', 'glu'],
      version: '25.2.4-1', size: 18.3, desc: 'OpenGL headers and the GLU library (gl.h, glu.h), drawn with WebGL 2 in Smoki\'s Code', deps: [],
      headers: ['GL/gl.h', 'GL/glu.h'], libs: ['opengl32', 'glu32', 'GL', 'GLU'],
      files: { '/usr/include/GL/gl.h': GL_H, '/usr/include/GL/glu.h': GLU_H, '/usr/lib/smoki/gl.c': GL_C },
      sources: ['/usr/lib/smoki/gl.c'],
    },
  };

  SC.graphicsLib = { BASE, PACKAGES, MATHF };
})(window.SC);
