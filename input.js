// 記錄玩家按了什麼：WASD、滑鼠位置、左右鍵

const Input = {
  up: false,
  down: false,
  left: false,
  right: false,
  mouseX: 0,        // 滑鼠在場地裡的座標（場地中心是 0,0）
  mouseY: 0,
  leftButton: false,
  rightButton: false,
  shootPressed: false,   // 剛剛點了左鍵；射出去後會被改回 false，所以按住不會連射

  init(canvas) {
    // 用 e.code 而不是 e.key：開著中文輸入法也認得到 WASD
    window.addEventListener('keydown', (e) => this.setKey(e.code, true));
    window.addEventListener('keyup', (e) => this.setKey(e.code, false));

    // 視窗失焦時把按鍵全放開，不然切出去再回來小人會一直走
    window.addEventListener('blur', () => {
      this.up = this.down = this.left = this.right = false;
      this.leftButton = this.rightButton = false;
      this.shootPressed = false;
    });

    canvas.addEventListener('mousemove', (e) => this.setMouse(canvas, e));

    canvas.addEventListener('mousedown', (e) => {
      this.setMouse(canvas, e);
      if (e.button === 0) {
        this.leftButton = true;
        this.shootPressed = true;
      }
      if (e.button === 2) this.rightButton = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftButton = false;
      if (e.button === 2) this.rightButton = false;
    });

    // 右鍵是大招，不要跳出瀏覽器選單
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  setMouse(canvas, e) {
    // canvas 有被縮放，要換算回 canvas 本來的大小，再把原點移到中心
    const rect = canvas.getBoundingClientRect();
    this.mouseX = (e.clientX - rect.left) * (canvas.width / rect.width) - canvas.width / 2;
    this.mouseY = (e.clientY - rect.top) * (canvas.height / rect.height) - canvas.height / 2;
  },

  setKey(code, down) {
    if (code === 'KeyW') this.up = down;
    if (code === 'KeyS') this.down = down;
    if (code === 'KeyA') this.left = down;
    if (code === 'KeyD') this.right = down;
  },
};
