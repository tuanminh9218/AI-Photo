import streamlit as st
import google.generativeai as genai

# Tiêu đề ứng dụng
st.title("AI Photo Assistant")

# Nhập API Key (Sẽ an toàn hơn nếu dùng Secret trong Streamlit Settings)
api_key = st.sidebar.text_input("Enter your Gemini API Key", type="password")

if api_key:
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-1.5-flash')

    prompt = st.text_input("Bạn muốn hỏi gì?")
    if st.button("Gửi"):
        response = model.generate_content(prompt)
        st.write(response.text)
else:
    st.warning("Vui lòng nhập API Key để bắt đầu.")
