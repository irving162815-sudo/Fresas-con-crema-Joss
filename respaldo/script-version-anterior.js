const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-nav');
const dropdown = document.querySelector('.nav-dropdown');
const dropdownButton = document.querySelector('.dropdown-toggle');

dropdownButton.addEventListener('click', () => {
  const isOpen = dropdownButton.getAttribute('aria-expanded') === 'true';
  dropdownButton.setAttribute('aria-expanded', String(!isOpen));
  dropdown.classList.toggle('is-open', !isOpen);
});

menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Abrir menú' : 'Cerrar menú');
  navigation.classList.toggle('is-open', !isOpen);
});

navigation.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menú');
    navigation.classList.remove('is-open');
    dropdownButton.setAttribute('aria-expanded', 'false');
    dropdown.classList.remove('is-open');
  });
});

document.addEventListener('click', (event) => {
  if (!dropdown.contains(event.target)) {
    dropdownButton.setAttribute('aria-expanded', 'false');
    dropdown.classList.remove('is-open');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    dropdownButton.setAttribute('aria-expanded', 'false');
    dropdown.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menú');
    navigation.classList.remove('is-open');
    menuButton.focus();
  }
});

const orderForm = document.querySelector('#order-form');
const formMessage = document.querySelector('#form-message');

orderForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(orderForm);
  const name = formData.get('name').trim();
  const flavor = formData.get('flavor');

  formMessage.textContent = `¡Gracias, ${name}! Tu ${flavor} ya quedó anotada. 🍓`;
  orderForm.reset();
});

document.querySelector('#year').textContent = new Date().getFullYear();
